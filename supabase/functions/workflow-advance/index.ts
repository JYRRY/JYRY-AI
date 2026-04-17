import { handleCors, json } from "../_shared/cors.ts";
import { getUserId, serviceClient } from "../_shared/supabase.ts";
import { advance, setStep, WORKFLOW_STEPS, type StepKey, type StepStatus } from "../_shared/workflow.ts";

/**
 * Manual workflow control: used when the user completes a step directly
 * (e.g. confirms they've reviewed documents) or when a skipped step needs
 * to be unblocked. Most steps advance automatically from their owner function.
 */
Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  try {
    const userId = await getUserId(req);
    const { step_key, status, meta } = await req.json();
    if (!WORKFLOW_STEPS.includes(step_key)) return json({ error: "unknown step" }, 400);

    const db = serviceClient();
    if (status === "done") {
      const next = await advance(db, userId, step_key as StepKey, meta ?? {});
      return json({ data: { advanced_to: next } });
    }
    await setStep(db, userId, step_key as StepKey, status as StepStatus, meta ?? {});
    return json({ data: { ok: true } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
