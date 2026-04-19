import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { runClaude, extractJson } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";
import { advance, notify } from "../_shared/workflow.ts";
import { embed } from "../_shared/embeddings.ts";

const SYSTEM = loadPrompt("advisor");

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const db = serviceClient();

    const { data: profile } = await db.from("profiles").select("*").eq("user_id", userId).single();
    const { data: docs } = await db.from("documents").select("type,extracted_json").eq("user_id", userId);
    if (!profile) return json({ error: "profile missing" }, 404);

    const profileBlock = JSON.stringify({ profile, documents: docs ?? [] }, null, 2);

    const result = await runClaude({
      agent:     "advisor",
      userId,
      model:     "claude-opus-4-7",
      system:    SYSTEM,
      cachedContext: profileBlock,
      user:      "Bitte analysiere das oben stehende Profil und empfehle passende Ausbildungsberufe.",
      maxTokens: 2000,
      temperature: 0.3,
    });

    const parsed = extractJson<{
      recommendations: { field: string; reason: string; match_score: number }[];
      summary_for_user: string;
    }>(result.text);

    // Embed top recommendation text → match companies
    const topText = parsed.recommendations.map((r) => r.field).join(", ");
    const [queryEmbedding] = await embed([topText]);
    const { data: matches } = await db.rpc("match_companies", {
      query_embedding: queryEmbedding,
      match_count: 10,
      filter_types: parsed.recommendations.map((r) => r.field.split(" ")[0]),
    });

    await db.from("profiles").update({
      bio: profile.bio ?? null, // keep untouched
    }).eq("user_id", userId);

    await advance(db, userId, "advisor", { recommendations: parsed.recommendations });
    await notify(db, userId, "advisor_ready",
      "Deine Berufsempfehlungen sind bereit",
      parsed.summary_for_user, "/dashboard/advisor");

    return json({
      data: { ...parsed, matched_companies: matches ?? [] },
      agent_run_id: result.agentRunId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
