import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { runClaude, extractJson } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";
import { advance, notify } from "../_shared/workflow.ts";

const SYSTEM = loadPrompt("advisor");

interface AdvisorBody {
  bundesland: string;
  specialty?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const body = (await req.json().catch(() => ({}))) as Partial<AdvisorBody>;
    const bundesland = body.bundesland?.trim();
    const specialty  = body.specialty?.trim() || null;
    if (!bundesland) return json({ error: "bundesland is required" }, 400);

    const db = serviceClient();

    const { data: profile } = await db.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) return json({ error: "profile missing" }, 404);

    const { data: docs } = await db.from("documents")
      .select("type,extracted_json")
      .eq("user_id", userId);

    // Admin-curated shortlist: state + (optional) specialty. No vectors.
    let q = db.from("companies")
      .select("id,name,email,address,ausbildung_types,bundesland,region")
      .eq("bundesland", bundesland)
      .limit(50);
    if (specialty) q = q.contains("ausbildung_types", [specialty]);
    const { data: candidates, error: candErr } = await q;
    if (candErr) throw candErr;

    const contextBlock = JSON.stringify({
      profile,
      documents: docs ?? [],
      bundesland,
      specialty,
      candidate_companies: candidates ?? [],
    }, null, 2);

    const result = await runClaude({
      agent:     "advisor",
      userId,
      model:     "claude-opus-4-7",
      system:    SYSTEM,
      cachedContext: contextBlock,
      user:
        "Analysiere das Profil oben. Wenn candidate_companies Einträge enthält, " +
        "ranke NUR diese Firmen (keine erfundenen) nach Passung und begründe jede Wahl auf Deutsch. " +
        "Empfehle außerdem passende Ausbildungsberufe.",
      maxTokens: 2500,
      temperature: 0.3,
    });

    const parsed = extractJson<{
      recommendations: { field: string; reason: string; match_score: number }[];
      ranked_companies?: { company_id: string; match_score: number; reason: string }[];
      summary_for_user: string;
    }>(result.text);

    if (specialty) {
      await db.from("profiles").update({ target_field: specialty }).eq("user_id", userId);
    }

    await advance(db, userId, "advisor", {
      recommendations: parsed.recommendations,
      ranked_company_ids: (parsed.ranked_companies ?? []).map((r) => r.company_id),
      bundesland,
      specialty,
    });
    await notify(db, userId, "advisor_ready",
      "Deine Berufsempfehlungen sind bereit",
      parsed.summary_for_user, "/dashboard/advisor");

    // Join ranked_companies back to the full company rows so Framer has addresses/emails.
    const byId = new Map((candidates ?? []).map((c) => [c.id, c]));
    const ranked = (parsed.ranked_companies ?? [])
      .map((r) => ({ ...byId.get(r.company_id), match_score: r.match_score, reason: r.reason }))
      .filter((r) => r.id);

    return json({
      data: {
        recommendations: parsed.recommendations,
        summary_for_user: parsed.summary_for_user,
        matched_companies: ranked,
      },
      agent_run_id: result.agentRunId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
