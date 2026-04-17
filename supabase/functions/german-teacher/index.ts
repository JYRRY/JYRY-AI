import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { runClaude } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";

const SYSTEM = loadPrompt("german-teacher");

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const body = await req.json();
    const { mode, message, ui_language = "de", history = [] } = body as {
      mode: "interview_prep" | "text_correction" | "free_chat";
      message: string; ui_language?: "de"|"ar"|"en";
      history?: { role: "user"|"assistant"; content: string }[];
    };

    const db = serviceClient();
    const { data: profile } = await db.from("profiles").select("german_level,target_field").eq("user_id", userId).single();

    const profileBlock = JSON.stringify({
      german_level: profile?.german_level ?? "A2",
      target_field: profile?.target_field ?? null,
      ui_language, mode,
    }, null, 2);

    const historyText = history.map((h) => `${h.role === "user" ? "Learner" : "Tutor"}: ${h.content}`).join("\n");
    const user = historyText
      ? `${historyText}\n\nLearner: ${message}`
      : `Learner: ${message}`;

    const result = await runClaude({
      agent: "german-teacher",
      userId,
      model: "claude-sonnet-4-6",
      system: SYSTEM,
      cachedContext: profileBlock,
      user,
      maxTokens: 500,
      temperature: 0.6,
    });

    return json({ data: { reply: result.text }, agent_run_id: result.agentRunId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
