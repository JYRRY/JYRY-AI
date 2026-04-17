import { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export const WORKFLOW_STEPS = [
  "upload",
  "process",
  "advisor",
  "cv",
  "letter",
  "send",
  "followup",
  "interview",
] as const;

export type StepKey = (typeof WORKFLOW_STEPS)[number];
export type StepStatus = "pending" | "in_progress" | "done" | "failed" | "blocked";

export async function setStep(
  db: SupabaseClient,
  userId: string,
  stepKey: StepKey,
  status: StepStatus,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, meta };
  if (status === "done") patch.completed_at = new Date().toISOString();
  await db.from("workflow_steps")
    .update(patch)
    .eq("user_id", userId)
    .eq("step_key", stepKey);
}

export async function advance(
  db: SupabaseClient,
  userId: string,
  completedStep: StepKey,
  meta: Record<string, unknown> = {},
): Promise<StepKey | null> {
  await setStep(db, userId, completedStep, "done", meta);
  const idx = WORKFLOW_STEPS.indexOf(completedStep);
  const next = WORKFLOW_STEPS[idx + 1] ?? null;
  if (next) await setStep(db, userId, next, "pending");
  return next;
}

export async function notify(
  db: SupabaseClient,
  userId: string,
  type: string,
  title: string,
  body?: string,
  actionUrl?: string,
): Promise<void> {
  await db.from("notifications").insert({
    user_id: userId, type, title, body, action_url: actionUrl,
  });
}
