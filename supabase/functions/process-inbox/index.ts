import { json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { runClaude, extractJson } from "../_shared/claude.ts";
import { loadPrompt } from "../_shared/prompts.ts";
import { listThreadMessages } from "../_shared/gmail.ts";
import { notify } from "../_shared/workflow.ts";

const SYSTEM = loadPrompt("email-triage");

/**
 * Runs on a 15-minute cron (see supabase/config.toml + cron schedule in migration).
 * Iterates all active email threads, fetches new messages, triages them,
 * updates applications + creates notifications.
 */
Deno.serve(async (_req) => {
  const db = serviceClient();
  const { data: threads } = await db.from("email_threads")
    .select("id, user_id, application_id, gmail_thread_id, last_message_at")
    .in("category", ["", "invitation", "info_request", "acknowledgment"])
    .limit(200);

  const results: unknown[] = [];

  for (const t of threads ?? []) {
    try {
      const msgs = await listThreadMessages(db, t.user_id, t.gmail_thread_id);
      const lastKnown = t.last_message_at ? new Date(t.last_message_at).getTime() : 0;

      for (const m of msgs) {
        if (new Date(m.date).getTime() <= lastKnown) continue;
        if (m.from.includes("<me@")) continue; // rough skip of outgoing

        const { data: stored } = await db.from("email_messages").insert({
          thread_id: t.id,
          user_id: t.user_id,
          gmail_message_id: m.id,
          direction: "in",
          subject: m.subject,
          body: m.body,
          sent_at: new Date(m.date).toISOString(),
        }).select("id").single();

        const result = await runClaude({
          agent: "email-triage",
          userId: t.user_id,
          model: "claude-haiku-4-5-20251001",
          system: SYSTEM,
          user: `Subject: ${m.subject}\nFrom: ${m.from}\n\n${m.body}`,
          maxTokens: 400,
          temperature: 0.1,
        });
        const triage = extractJson<{
          category: string; summary: string; priority: string;
          extracted_dates: string[]; suggested_reply: string | null;
        }>(result.text);

        await db.from("email_messages").update({ ai_classification: triage }).eq("id", stored?.id);
        await db.from("email_threads").update({
          category: triage.category,
          last_message_at: new Date(m.date).toISOString(),
          last_checked_at: new Date().toISOString(),
        }).eq("id", t.id);

        // Update application status from triage
        const statusMap: Record<string,string> = {
          invitation: "interview", offer: "accepted", rejection: "rejected", info_request: "replied",
        };
        const nextStatus = statusMap[triage.category];
        if (nextStatus && t.application_id) {
          await db.from("applications").update({
            status: nextStatus, replied_at: new Date().toISOString(),
          }).eq("id", t.application_id);
        }

        await notify(db, t.user_id,
          `email_${triage.category}`,
          titleFor(triage.category),
          triage.summary,
          `/dashboard/applications/${t.application_id ?? ""}`);

        results.push({ thread: t.gmail_thread_id, category: triage.category });
      }
    } catch (err) {
      results.push({ thread: t.gmail_thread_id, error: (err as Error).message });
    }
  }
  return json({ processed: results.length, results });
});

function titleFor(category: string): string {
  switch (category) {
    case "invitation":     return "Einladung zum Vorstellungsgespräch";
    case "offer":          return "Ausbildungsangebot erhalten";
    case "rejection":      return "Absage erhalten";
    case "info_request":   return "Unternehmen bittet um weitere Informationen";
    case "acknowledgment": return "Bewerbungseingang bestätigt";
    default:               return "Neue E-Mail zu deiner Bewerbung";
  }
}
