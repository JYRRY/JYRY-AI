/**
 * Multi-file uploader — drops files into Storage user-docs bucket.
 * Storage webhook triggers process-upload Edge Function automatically.
 */
import * as React from "react";
import { supabase } from "../framer-client.ts";
import { useSupabaseAuth } from "./useSupabaseAuth.tsx";

export default function DocumentUploader() {
  const { userId } = useSupabaseAuth();
  const [uploads, setUploads] = React.useState<{ name: string; progress: "uploading"|"done"|"error" }[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !userId) return;
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, progress: "uploading" }]);
      const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("user-docs").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      setUploads((u) => u.map((x) => x.name === file.name ? { ...x, progress: error ? "error" : "done" } : x));
    }
  };

  return (
    <div style={{ padding: 24, border: "2px dashed #999", borderRadius: 12, fontFamily: "Inter, sans-serif" }}>
      <p style={{ marginTop: 0 }}>Lade Zeugnisse, Zertifikate und ein Foto hoch (PDF, JPG, PNG).</p>
      <input
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <ul style={{ marginTop: 12, paddingLeft: 20 }}>
        {uploads.map((u, i) => (
          <li key={i} style={{ color: u.progress === "error" ? "#b00" : u.progress === "done" ? "#070" : "#444" }}>
            {u.name} — {u.progress}
          </li>
        ))}
      </ul>
    </div>
  );
}
