import { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

/**
 * Gmail helpers. Uses the user's refresh_token (stored encrypted in
 * user_email_credentials) to mint a short-lived access token, then talks
 * to gmail.googleapis.com directly (no googleapis SDK needed on Deno).
 */

interface Credentials {
  email_address: string;
  refresh_token: string;
}

async function getCredentials(db: SupabaseClient, userId: string): Promise<Credentials> {
  const { data, error } = await db.rpc("decrypt_email_credentials", { p_user_id: userId }); // optional pgsodium wrapper
  if (error || !data) {
    // Fallback: decrypt client-side if you chose envelope encryption in-app.
    const { data: row } = await db.from("user_email_credentials")
      .select("email_address, refresh_token_encrypted").eq("user_id", userId).single();
    if (!row) throw new Error("no email credentials linked");
    const keyB64 = Deno.env.get("EMAIL_TOKEN_ENCRYPTION_KEY");
    if (!keyB64) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY not set");
    const refresh_token = await aesGcmDecrypt(row.refresh_token_encrypted as unknown as string, keyB64);
    return { email_address: row.email_address, refresh_token };
  }
  return data as Credentials;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`gmail oauth refresh failed: ${res.status}`);
  const json = await res.json();
  return json.access_token as string;
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface SendEmailParams {
  db: SupabaseClient;
  userId: string;
  to: string;
  subject: string;
  bodyText: string;
  attachments?: GmailAttachment[];
  threadId?: string;
  bcc?: string | null;
}

export async function sendEmail(p: SendEmailParams): Promise<{ id: string; threadId: string }> {
  const creds = await getCredentials(p.db, p.userId);
  const accessToken = await getAccessToken(creds.refresh_token);

  // BCC resolution: explicit null → skip; undefined → env default; string → use as-is.
  // This guarantees every outgoing application is archived unless a caller explicitly opts out.
  let bccAddress: string | null;
  if (p.bcc === null) {
    bccAddress = null;
  } else if (p.bcc === undefined) {
    const envArchive = Deno.env.get("JYRY_ARCHIVE_EMAIL");
    if (!envArchive) {
      console.warn("JYRY_ARCHIVE_EMAIL unset, outgoing email not archived");
      bccAddress = null;
    } else {
      bccAddress = envArchive;
    }
  } else {
    bccAddress = p.bcc;
  }

  const boundary = `====${crypto.randomUUID()}====`;
  const parts: string[] = [];
  parts.push(`From: ${creds.email_address}`);
  parts.push(`To: ${p.to}`);
  if (bccAddress) parts.push(`Bcc: ${bccAddress}`);
  parts.push(`Subject: ${mimeEncodeHeader(p.subject)}`);
  parts.push(`MIME-Version: 1.0`);
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  parts.push("");
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: text/plain; charset="UTF-8"`);
  parts.push(`Content-Transfer-Encoding: 7bit`);
  parts.push("");
  parts.push(p.bodyText);
  for (const att of p.attachments ?? []) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    parts.push(`Content-Transfer-Encoding: base64`);
    parts.push("");
    // Gmail expects raw base64; chunk at 76 chars for RFC compliance.
    parts.push(att.contentBase64.match(/.{1,76}/g)?.join("\n") ?? att.contentBase64);
  }
  parts.push(`--${boundary}--`);

  const raw = base64UrlEncode(parts.join("\r\n"));
  const body: Record<string, string> = { raw };
  if (p.threadId) body.threadId = p.threadId;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gmail send failed ${res.status}: ${await res.text()}`);
  const out = await res.json();
  return { id: out.id, threadId: out.threadId };
}

export async function listThreadMessages(
  db: SupabaseClient, userId: string, threadId: string,
): Promise<{ id: string; subject: string; body: string; from: string; date: string }[]> {
  const creds = await getCredentials(db, userId);
  const token = await getAccessToken(creds.refresh_token);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`gmail thread fetch failed ${res.status}`);
  const data = await res.json();
  return (data.messages ?? []).map((m: GmailMessage) => parseGmailMessage(m));
}

interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string;
  payload: { headers: GmailHeader[]; parts?: { mimeType: string; body: { data?: string } }[]; body?: { data?: string }; mimeType: string };
}
function parseGmailMessage(m: GmailMessage) {
  const h = (name: string) => m.payload.headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  let body = "";
  if (m.payload.parts) {
    const text = m.payload.parts.find((p) => p.mimeType === "text/plain");
    if (text?.body?.data) body = atob(text.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  } else if (m.payload.body?.data) {
    body = atob(m.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  }
  return { id: m.id, subject: h("Subject"), body, from: h("From"), date: h("Date") };
}

// ─────────── helpers ───────────
function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function mimeEncodeHeader(s: string): string {
  return /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;
}

async function aesGcmDecrypt(ciphertextB64: string, keyB64: string): Promise<string> {
  const raw = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export async function aesGcmEncrypt(plaintext: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  let bin = "";
  for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin);
}
