/**
 * Lists all applications with current status, CTAs to generate letter and send.
 */
import * as React from "react";
import { supabase, invokeAgent, signedUrl } from "../framer-client.ts";
import { useSupabaseAuth } from "./useSupabaseAuth.tsx";

interface App {
  id: string;
  status: string;
  sent_at: string | null;
  companies: { id: string; name: string; email: string; ausbildung_types: string[] };
  letter_doc_id: string | null;
  cv_doc_id: string | null;
}

export default function ApplicationsList() {
  const { userId } = useSupabaseAuth();
  const [apps, setApps] = React.useState<App[]>([]);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("applications")
      .select("id,status,sent_at,letter_doc_id,cv_doc_id,companies(id,name,email,ausbildung_types)")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (data) setApps(data as unknown as App[]);
  }, [userId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  React.useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`apps-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, refresh]);

  const send = async (app: App) => {
    await invokeAgent("send-application", {
      application_id: app.id,
      idempotency_key: crypto.randomUUID(),
    });
    await refresh();
  };

  const generateLetter = async (app: App) => {
    await invokeAgent("generate-letter", {
      company_id: app.companies.id,
      ausbildung_type: app.companies.ausbildung_types[0],
    });
    await refresh();
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {apps.length === 0 && <p>Noch keine Bewerbungen. Starte nach der Beratung.</p>}
      {apps.map((app) => (
        <div key={app.id} style={row}>
          <div>
            <strong>{app.companies.name}</strong>
            <div style={{ fontSize: 13, opacity: 0.7 }}>{app.companies.ausbildung_types.join(" · ")}</div>
          </div>
          <span style={badge(app.status)}>{statusLabel(app.status)}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {!app.letter_doc_id && <button style={btn} onClick={() => generateLetter(app)}>Anschreiben</button>}
            {app.letter_doc_id && app.status === "draft" && <button style={btn} onClick={() => send(app)}>Senden</button>}
            {app.letter_doc_id && (
              <button style={btn} onClick={async () => window.open(await signedUrl(`anschreiben-preview`), "_blank")}>
                Vorschau
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const row: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "2fr 1fr auto", alignItems: "center", gap: 16,
  padding: "12px 16px", borderBottom: "1px solid #eee",
};
const btn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer",
};
function statusLabel(s: string): string {
  return ({ draft: "Entwurf", sent: "Gesendet", replied: "Antwort", interview: "Einladung",
    rejected: "Absage", accepted: "Angenommen", withdrawn: "Zurückgezogen" } as Record<string,string>)[s] ?? s;
}
function badge(s: string): React.CSSProperties {
  const c = ({ draft: "#999", sent: "#0070f3", replied: "#f59e0b", interview: "#10b981",
    rejected: "#ef4444", accepted: "#059669", withdrawn: "#6b7280" } as Record<string,string>)[s] ?? "#999";
  return { color: "#fff", background: c, padding: "2px 10px", borderRadius: 10, fontSize: 12 };
}
