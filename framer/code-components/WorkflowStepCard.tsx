/**
 * Single workflow-step card. Subscribes via Realtime to its own row.
 * Paste as Framer Code Component `WorkflowStepCard`.
 *
 * Props (Framer controls):
 *  - stepKey: one of upload/process/advisor/cv/letter/send/followup/interview
 *  - title:   human label
 *  - action:  (optional) label for the CTA button
 *  - agent:   (optional) edge function name to invoke when action clicked
 */
import * as React from "react";
import { supabase, invokeAgent } from "../framer-client.ts";
import { useSupabaseAuth } from "./useSupabaseAuth.tsx";

type Status = "pending" | "in_progress" | "done" | "failed" | "blocked";

export default function WorkflowStepCard(props: {
  stepKey: string;
  title: string;
  action?: string;
  agent?: string;
}) {
  const { userId } = useSupabaseAuth();
  const [status, setStatus] = React.useState<Status>("pending");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!userId) return;
    supabase.from("workflow_steps").select("status")
      .eq("user_id", userId).eq("step_key", props.stepKey).maybeSingle()
      .then(({ data }) => data && setStatus(data.status as Status));

    const channel = supabase.channel(`step-${props.stepKey}-${userId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "workflow_steps",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as { step_key: string; status: Status };
        if (row.step_key === props.stepKey) setStatus(row.status);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, props.stepKey]);

  const handleClick = async () => {
    if (!props.agent) return;
    setBusy(true);
    try { await invokeAgent(props.agent); }
    finally { setBusy(false); }
  };

  return (
    <div style={cardStyle(status)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{props.title}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{labelFor(status)}</span>
      </div>
      {props.action && props.agent && status !== "done" && (
        <button onClick={handleClick} disabled={busy || status === "in_progress"} style={btnStyle}>
          {busy ? "..." : props.action}
        </button>
      )}
    </div>
  );
}

function labelFor(s: Status): string {
  return { pending: "Ausstehend", in_progress: "In Bearbeitung", done: "Erledigt", failed: "Fehler", blocked: "Blockiert" }[s];
}
function cardStyle(status: Status): React.CSSProperties {
  const colors: Record<Status, string> = {
    pending: "#f5f5f5", in_progress: "#e0f2fe", done: "#dcfce7", failed: "#fee2e2", blocked: "#fef3c7",
  };
  return { padding: 16, borderRadius: 12, background: colors[status], fontFamily: "Inter, sans-serif" };
}
const btnStyle: React.CSSProperties = {
  marginTop: 12, padding: "8px 14px", borderRadius: 8,
  background: "#111", color: "#fff", border: 0, cursor: "pointer",
};
