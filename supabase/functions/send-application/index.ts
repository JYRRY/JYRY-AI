import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { runClaude, extractJson } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";
import { sendEmail } from "../_shared/gmail.ts";
import { advance, notify } from "../_shared/workflow.ts";

const SYSTEM = loadPrompt("application-orchestrator");

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const { application_id, idempotency_key } = await req.json();
    const db = serviceClient();

    // Idempotency: if this key already sent, return existing.
    const { data: existing } = await db.from("applications")
      .select("id,status,sent_at").eq("idempotency_key", idempotency_key).eq("user_id", userId).maybeSingle();
    if (existing && existing.status !== "draft") {
      return json({ data: { application_id: existing.id, already_sent: true } });
    }

    const { data: app } = await db.from("applications").select("*, companies(*)").eq("id", application_id).eq("user_id", userId).single();
    if (!app) return json({ error: "application not found" }, 404);

    const [{ data: cvDoc }, { data: letterDoc }, { data: profile }] = await Promise.all([
      app.cv_doc_id     ? db.from("generated_documents").select("pdf_path,content_md").eq("id", app.cv_doc_id).single()     : Promise.resolve({ data: null }),
      app.letter_doc_id ? db.from("generated_documents").select("pdf_path,content_md").eq("id", app.letter_doc_id).single() : Promise.resolve({ data: null }),
      db.from("profiles").select("*").eq("user_id", userId).single(),
    ]);
    if (!cvDoc || !letterDoc) return json({ error: "documents missing" }, 400);

    const orchestratorInput = {
      company:   app.companies,
      applicant: profile,
      letter_subject: letterDoc.content_md.split("\n").find((l: string) => /Bewerbung/i.test(l)) ?? "Bewerbung um einen Ausbildungsplatz",
    };

    const result = await runClaude({
      agent: "application-orchestrator",
      userId,
      model: "claude-haiku-4-5-20251001",
      system: SYSTEM,
      user: JSON.stringify(orchestratorInput, null, 2),
      maxTokens: 600,
      temperature: 0.2,
    });
    const decision = extractJson<{ decision: "send"|"skip"; reason?: string; email_subject: string; email_body: string }>(result.text);

    if (decision.decision === "skip") {
      await db.from("applications").update({ status: "withdrawn", notes: decision.reason }).eq("id", application_id);
      return json({ data: { decision: "skip", reason: decision.reason } });
    }

    const [cvPdf, letterPdf] = await Promise.all([
      db.storage.from("generated").download(cvDoc.pdf_path!),
      db.storage.from("generated").download(letterDoc.pdf_path!),
    ]);
    if (cvPdf.error || letterPdf.error) throw new Error("pdf download failed");

    const cvB64     = btoa(String.fromCharCode(...new Uint8Array(await cvPdf.data!.arrayBuffer())));
    const letterB64 = btoa(String.fromCharCode(...new Uint8Array(await letterPdf.data!.arrayBuffer())));

    const sent = await sendEmail({
      db, userId,
      to: app.companies.email!,
      subject: decision.email_subject,
      bodyText: decision.email_body,
      attachments: [
        { filename: "Lebenslauf.pdf",  mimeType: "application/pdf", contentBase64: cvB64 },
        { filename: "Anschreiben.pdf", mimeType: "application/pdf", contentBase64: letterB64 },
      ],
    });

    await db.from("applications").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      idempotency_key,
    }).eq("id", application_id);

    const { data: thread, error: threadErr } = await db.from("email_threads").insert({
      user_id: userId, application_id, gmail_thread_id: sent.threadId, last_message_at: new Date().toISOString(),
    }).select("id").single();
    if (threadErr || !thread) throw new Error(`email_threads insert failed: ${threadErr?.message}`);

    await db.from("email_messages").insert({
      thread_id: thread.id,
      user_id: userId,
      gmail_message_id: sent.id,
      direction: 'out',
      subject: decision.email_subject,
      body: decision.email_body,
      sent_at: new Date().toISOString(),
    });

    await advance(db, userId, "send", { application_id, company: app.companies.name });
    await notify(db, userId, "application_sent",
      `Bewerbung an ${app.companies.name} gesendet`,
      "Wir benachrichtigen dich, sobald eine Antwort eintrifft.",
      `/dashboard/applications/${application_id}`);

    return json({ data: { application_id, gmail_thread_id: sent.threadId }, agent_run_id: result.agentRunId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
