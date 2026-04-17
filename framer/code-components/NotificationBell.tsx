/**
 * Bell with unread badge; subscribes to notifications via Realtime.
 */
import * as React from "react";
import { supabase } from "../framer-client.ts";
import { useSupabaseAuth } from "./useSupabaseAuth.tsx";

interface Notif {
  id: string; type: string; title: string; body: string | null;
  action_url: string | null; read_at: string | null; created_at: string;
}

export default function NotificationBell() {
  const { userId } = useSupabaseAuth();
  const [list, setList] = React.useState<Notif[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!userId) return;
    supabase.from("notifications").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => data && setList(data as Notif[]));

    const ch = supabase.channel(`notif-${userId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, (payload) => setList((prev) => [payload.new as Notif, ...prev].slice(0, 20)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const unread = list.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setList((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  return (
    <div style={{ position: "relative", fontFamily: "Inter, sans-serif" }}>
      <button onClick={() => setOpen(!open)} style={bell}>
        🔔{unread > 0 && <span style={badgeDot}>{unread}</span>}
      </button>
      {open && (
        <div style={dropdown}>
          {list.length === 0 && <p style={{ padding: 16 }}>Keine Benachrichtigungen.</p>}
          {list.map((n) => (
            <div key={n.id}
                 onClick={() => { if (!n.read_at) markRead(n.id); if (n.action_url) window.location.href = n.action_url; }}
                 style={{ ...item, opacity: n.read_at ? 0.55 : 1 }}>
              <strong>{n.title}</strong>
              {n.body && <div style={{ fontSize: 13, opacity: 0.8 }}>{n.body}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const bell: React.CSSProperties = { border: 0, background: "transparent", fontSize: 22, cursor: "pointer", position: "relative" };
const badgeDot: React.CSSProperties = {
  position: "absolute", top: -4, right: -6, background: "#ef4444", color: "#fff",
  fontSize: 10, borderRadius: 10, padding: "1px 6px",
};
const dropdown: React.CSSProperties = {
  position: "absolute", right: 0, top: 36, width: 320, maxHeight: 420, overflow: "auto",
  background: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.12)", borderRadius: 12, zIndex: 100,
};
const item: React.CSSProperties = {
  padding: "10px 14px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
};
