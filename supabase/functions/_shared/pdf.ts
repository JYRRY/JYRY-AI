import { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { marked } from "npm:marked@14.1.3";

/**
 * Convert Markdown to a styled HTML document, then to PDF via a
 * Playwright-compatible renderer hosted separately. For the MVP we use
 * a simple HTML-only fallback stored as text/html in Storage; the real
 * PDF rendering will be swapped in once a Gotenberg/Browserless endpoint
 * is configured via PDF_RENDER_URL.
 */
export async function markdownToPdfBytes(markdown: string, title: string): Promise<Uint8Array> {
  const html = renderHtml(markdown, title);
  const renderUrl = Deno.env.get("PDF_RENDER_URL");
  if (renderUrl) {
    const res = await fetch(renderUrl, {
      method: "POST",
      headers: { "content-type": "text/html" },
      body: html,
    });
    if (!res.ok) throw new Error(`pdf render failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  // Fallback: store HTML bytes (reader will still render). Acceptable for MVP.
  return new TextEncoder().encode(html);
}

function renderHtml(markdown: string, title: string): string {
  const body = marked.parse(markdown, { gfm: true, breaks: false });
  return `<!doctype html><html lang="de"><head>
    <meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 2cm; }
      body { font-family: "Helvetica","Arial",sans-serif; font-size: 11pt; color: #111; line-height: 1.45; }
      h1 { font-size: 20pt; margin: 0 0 .3em; }
      h2 { font-size: 13pt; margin: 1.2em 0 .4em; border-bottom: 1px solid #999; padding-bottom: 2px; }
      h3 { font-size: 11pt; margin: .9em 0 .2em; }
      ul { padding-left: 1.2em; }
      table { border-collapse: collapse; width: 100%; }
      td, th { padding: 3px 6px; vertical-align: top; }
    </style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function uploadPdf(
  db: SupabaseClient,
  userId: string,
  kind: "cv" | "letter",
  bytes: Uint8Array,
): Promise<string> {
  const path = `${userId}/${kind}-${Date.now()}.pdf`;
  const { error } = await db.storage.from("generated").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
