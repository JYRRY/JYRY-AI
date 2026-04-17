# Framer Integration Guide — JYRY-AI

This repo is the **backend** for the Framer-hosted frontend. The browser talks to Supabase directly (auth, storage, realtime) and invokes Edge Functions for AI work. **No private keys** ever live in Framer.

## 1. Create the Framer Code Component shell

In Framer: **Insert → Code Component → New Component**. Paste `framer-client.ts` (below) as a shared file, then import it from each component.

### `framer-client.ts`

```ts
// framer/framer-client.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

export const supabase = createClient(
  // Set these as Framer Site Settings → Variables
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
)

export async function invokeAgent<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  return (data as { data: T }).data
}
```

**Framer Site Variables** (Settings → Variables → add both as *public*):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | https://<your-ref>.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key from Supabase dashboard) |

## 2. Auth

Google OAuth with the extra Gmail scopes — so the same consent that signs the user in also authorizes sending mail from their account.

```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    scopes: "email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
    redirectTo: window.location.origin + "/dashboard",
  },
})
```

The first time a user signs in, call `/functions/v1/save-email-creds` (add this as a trivial 9th function if needed) to persist the `provider_refresh_token` from `supabase.auth.getSession()` into `user_email_credentials` encrypted. Subsequent sign-ins don't need it.

## 3. Document upload (direct to Storage)

```ts
const { data, error } = await supabase.storage
  .from("user-docs")
  .upload(`${userId}/${crypto.randomUUID()}-${file.name}`, file, {
    contentType: file.type,
    upsert: false,
  })
```

The `process-upload` Edge Function is wired to the Storage `INSERT` webhook and runs OCR + embedding automatically. The workflow advances on its own — Framer just subscribes to `workflow_steps`.

## 4. Realtime workflow state

Subscribe once, re-render cards as steps flip:

```ts
supabase
  .channel(`workflow:${userId}`)
  .on("postgres_changes", {
    event: "*", schema: "public", table: "workflow_steps",
    filter: `user_id=eq.${userId}`,
  }, (payload) => setSteps((prev) => updateStep(prev, payload.new)))
  .subscribe()
```

Same pattern for `notifications` and `applications`.

## 5. Invoke an agent

```ts
// Generate CV after documents are processed
const cv = await invokeAgent<{ document_id: string; pdf_path: string }>("generate-cv", {})

// Create a letter for a specific company
const letter = await invokeAgent("generate-letter", {
  company_id: "...", ausbildung_type: "Fachinformatiker", earliest_start: "2026-09-01"
})

// Fire the send
await invokeAgent("send-application", {
  application_id: letter.application_id,
  idempotency_key: crypto.randomUUID(),
})
```

## 6. Signed URLs for PDFs

```ts
const { data } = await supabase.storage.from("generated")
  .createSignedUrl(pdfPath, 3600)          // 1-hour signed URL
// embed in <iframe src={data.signedUrl}> or download link
```

## 7. Dashboard wiring (recommended layout)

Map each component in `framer/code-components/` to one workflow step:

| Step | Component | Triggers |
|---|---|---|
| upload | `DocumentUploader.tsx` | Storage upload → auto `process` |
| advisor | `AdvisorCard.tsx` (call this component) | `invokeAgent("advisor", {})` |
| cv | `WorkflowStepCard.tsx` | `invokeAgent("generate-cv", {})` |
| letter+send | `ApplicationsList.tsx` | per-company send button |
| * | `NotificationBell.tsx` | realtime badge |

Every component below is a drop-in React component intended to be pasted as a Framer Code Component.
