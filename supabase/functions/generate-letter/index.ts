import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { runClaude, extractJson } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";
import { markdownToPdfBytes, uploadPdf } from "../_shared/pdf.ts";
import { advance, notify } from "../_shared/workflow.ts";

const SYSTEM = loadPrompt("letter-writer");

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const body = await req.json();
    const { company_id, ausbildung_type, earliest_start } = body as {
      company_id: string; ausbildung_type: string; earliest_start?: string;
    };

    const db = serviceClient();
    const [{ data: profile }, { data: company }] = await Promise.all([
      db.from("profiles").select("*").eq("user_id", userId).single(),
      db.from("companies").select("*").eq("id", company_id).single(),
    ]);
    if (!profile) return json({ error: "profile missing" }, 404);
    if (!company) return json({ error: "company not found" }, 404);

    const profileBlock = JSON.stringify({ profile }, null, 2);
    const userMsg = JSON.stringify({
      company,
      ausbildung_type,
      earliest_start: earliest_start ?? "ab sofort",
    }, null, 2);

    const result = await runClaude({
      agent:     "generate-letter",
      userId,
      model:     "claude-sonnet-4-6",
      system:    SYSTEM,
      cachedContext: profileBlock,
      user:      `Schreibe das Anschreiben für die folgende Bewerbung:\n\n${userMsg}`,
      maxTokens: 1800,
      temperature: 0.5,
    });

    const parsed = extractJson<{ letter_markdown: string; subject: string; tone_used: string }>(result.text);

    const pdfBytes = await markdownToPdfBytes(parsed.letter_markdown, `Anschreiben – ${company.name}`);
    const pdfPath = await uploadPdf(db, userId, "letter", pdfBytes);

    // Upsert a draft application; we don't send here — send-application does.
    const { data: app } = await db.from("applications").upsert({
      user_id: userId,
      company_id,
      status: "draft",
    }, { onConflict: "user_id,company_id,status", ignoreDuplicates: false })
      .select("id").single();

    const { data: doc } = await db.from("generated_documents").insert({
      user_id: userId,
      application_id: app?.id,
      type: "letter",
      content_md: parsed.letter_markdown,
      pdf_path: pdfPath,
    }).select("id").single();

    if (app?.id) {
      await db.from("applications").update({ letter_doc_id: doc?.id }).eq("id", app.id);
    }

    await advance(db, userId, "letter", { application_id: app?.id });
    await notify(db, userId, "letter_ready",
      `Anschreiben für ${company.name} ist bereit`, parsed.subject, `/dashboard/applications/${app?.id}`);

    return json({
      data: {
        application_id: app?.id,
        document_id:    doc?.id,
        pdf_path:       pdfPath,
        subject:        parsed.subject,
      },
      agent_run_id: result.agentRunId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
