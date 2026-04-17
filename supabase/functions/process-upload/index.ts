import { json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { embed, extractFromImage } from "../_shared/openai.ts";
import { advance, notify } from "../_shared/workflow.ts";

/**
 * Triggered by Supabase Storage webhook (user-docs bucket, INSERT).
 * Payload: { record: { name, bucket_id, owner, ... } }
 * Extracts text/fields from the file, embeds, stores. Advances 'process' step
 * once the user has at least one document processed.
 */
Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const rec = payload.record;
    if (!rec || rec.bucket_id !== "user-docs") return json({ skipped: true });

    const db = serviceClient();
    const userId: string = rec.owner ?? rec.metadata?.user_id;
    const path: string = rec.name;

    const { data: file, error } = await db.storage.from("user-docs").download(path);
    if (error || !file) throw error ?? new Error("download failed");

    const mime = file.type || "application/octet-stream";
    const isImage = mime.startsWith("image/");
    const type = guessDocType(path);

    let extracted: unknown = null;
    let embedText = "";
    if (isImage) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const b64 = btoa(String.fromCharCode(...buf));
      extracted = await extractFromImage(
        b64, mime,
        "Extract all relevant fields from this document. " +
        "Include: institution name, dates, grades, subjects, degree/certificate type. " +
        "Return JSON with keys: institution, dates, grades (object with subject→grade), degree, notes."
      );
      embedText = JSON.stringify(extracted);
    } else {
      // PDFs: skip OCR for MVP, use filename + type as embed seed.
      embedText = `Uploaded ${type} document: ${path}`;
      extracted = { note: "pdf awaiting OCR backend" };
    }

    const [vector] = await embed([embedText]);
    const { data: doc } = await db.from("documents").insert({
      user_id: userId,
      type,
      storage_path: path,
      original_name: rec.metadata?.original_name ?? path.split("/").pop(),
      mime_type: mime,
      extracted_json: extracted,
      embedding: vector,
    }).select("id").single();

    // If this is the user's first processed document, advance 'upload'→'process'→'advisor'
    const { count } = await db.from("documents").select("*", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= 1) {
      await advance(db, userId, "upload", { first_doc_id: doc?.id });
      await advance(db, userId, "process", { doc_count: count });
      await notify(db, userId, "documents_processed", "Deine Dokumente sind verarbeitet",
        "Als Nächstes analysieren wir dein Profil und schlagen Ausbildungsberufe vor.", "/dashboard");
    }

    return json({ data: { document_id: doc?.id } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function guessDocType(path: string): string {
  const n = path.toLowerCase();
  if (n.includes("zeugnis") || n.includes("abitur") || n.includes("school")) return "zeugnis";
  if (n.includes("cv") || n.includes("lebenslauf") || n.includes("resume")) return "cv_old";
  if (n.includes("foto") || n.includes("photo") || n.endsWith(".jpg") || n.endsWith(".png")) return "photo";
  if (n.includes("cert") || n.includes("zertifikat") || n.includes("telc")) return "certificate";
  return "other";
}
