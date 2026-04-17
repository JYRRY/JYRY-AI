import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { runClaude, extractJson } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";
import { markdownToPdfBytes, uploadPdf } from "../_shared/pdf.ts";
import { advance, notify } from "../_shared/workflow.ts";

const SYSTEM = loadPrompt("cv-generator");

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const body = await req.json().catch(() => ({}));
    const targetOverride: string | undefined = body.target_field_override;

    const db = serviceClient();
    const { data: profile } = await db.from("profiles").select("*").eq("user_id", userId).single();
    const { data: docs } = await db.from("documents").select("type,extracted_json").eq("user_id", userId);
    if (!profile) return json({ error: "profile missing" }, 404);

    const profileBlock = JSON.stringify({
      profile: { ...profile, target_field: targetOverride ?? profile.target_field },
      documents: docs ?? [],
    }, null, 2);

    const result = await runClaude({
      agent:     "generate-cv",
      userId,
      model:     "claude-sonnet-4-6",
      system:    SYSTEM,
      cachedContext: profileBlock,
      user:      "Erstelle den tabellarischen Lebenslauf für dieses Profil.",
      maxTokens: 2500,
      temperature: 0.3,
    });

    const parsed = extractJson<{ cv_markdown: string; sections_present: string[] }>(result.text);

    const pdfBytes = await markdownToPdfBytes(parsed.cv_markdown, `Lebenslauf – ${profile.full_name ?? "JYRY"}`);
    const pdfPath = await uploadPdf(db, userId, "cv", pdfBytes);

    const { data: inserted } = await db.from("generated_documents").insert({
      user_id: userId,
      type: "cv",
      content_md: parsed.cv_markdown,
      pdf_path: pdfPath,
    }).select("id").single();

    await advance(db, userId, "cv", { document_id: inserted?.id });
    await notify(db, userId, "cv_ready", "Dein Lebenslauf ist bereit", "Du kannst ihn jetzt ansehen.", "/dashboard/documents");

    return json({
      data: { document_id: inserted?.id, pdf_path: pdfPath, ...parsed },
      agent_run_id: result.agentRunId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
