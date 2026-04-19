# Setup Guide — Connect Supabase, Agents, and Framer

This guide walks you through **three tasks** end-to-end. Do them in order. Every step tells you exactly where to click and what to copy.

> **You need, in this order:** a Supabase account → a Google Cloud account → a Framer project.

---

## Task 1 — Create Supabase project & set secrets

**Goal:** have a cloud database + Edge Function runtime ready.

### 1.1 Create the project

1. Open https://supabase.com/dashboard → **New Project**.
2. Fill in:
   - Name: `jyry-ai`
   - Database Password: **generate a strong one and save it somewhere** — you will need it twice.
   - Region: `Frankfurt (eu-central-1)` (closest to German users).
3. Wait ~2 minutes until it says "Project is ready".
4. On the project dashboard, copy the **Project Reference ID** from the URL:
   ```
   https://supabase.com/dashboard/project/abcdefghijklmnop
                                            ^^^^^^^^^^^^^^^^ ← this
   ```

### 1.2 Generate a Supabase access token

1. Go to https://supabase.com/dashboard/account/tokens
2. Click **Generate new token**, name it `codespaces-deploy`.
3. Copy the token (starts with `sbp_...`) — you see it only once.

### 1.3 Generate an encryption key for email tokens

In any terminal, run:
```bash
openssl rand -base64 32
```
Save the output — it's the `EMAIL_TOKEN_ENCRYPTION_KEY`.

### 1.4 Create the archive mailbox (one-time)

Every outgoing application email is silently BCC'd to a JYRY-owned inbox so we keep an authoritative copy (for transparency, debugging, and backup if a user revokes our OAuth). A **free @gmail.com account** is enough — no paid Workspace licence needed, because this inbox only receives mail:

1. Open https://accounts.google.com/signup → create a new Gmail account, e.g. `archive.jyrygroup@gmail.com`.
2. Nothing else to configure — you'll never log in to send mail, it just accumulates incoming copies.
3. Remember this address: you'll paste it as `JYRY_ARCHIVE_EMAIL` in step 1.5.

Storage note: a free Gmail account has 15 GB, which fits ~50,000 applications (each ~300 KB with 2 PDFs attached). If you outgrow that, you can upgrade to Google One or switch to a Workspace mailbox later by changing the env var — no code change needed.

If you skip this step entirely, Gmail sends still succeed, but nothing is archived and each run logs a warning.

### 1.5 Add all secrets to GitHub Codespaces

1. Open https://github.com/settings/codespaces
2. Scroll to **Codespace secrets** → **New secret** (one per row below):

   | Name                         | Value                                               |
   |------------------------------|-----------------------------------------------------|
   | `ANTHROPIC_API_KEY`          | your Anthropic key (`sk-ant-...`)                   |
   | `OPENAI_API_KEY`             | your OpenAI key (`sk-...`) — used **only** for document vector embeddings; all AI agents use Claude |
   | `SUPABASE_ACCESS_TOKEN`      | the `sbp_...` from step 1.2                         |
   | `SUPABASE_DB_PASSWORD`       | the DB password from step 1.1                       |
   | `EMAIL_TOKEN_ENCRYPTION_KEY` | the base64 string from step 1.3                     |
   | `JYRY_ARCHIVE_EMAIL`         | the full Gmail address from step 1.4 (e.g. `archive.jyrygroup@gmail.com`) |

   For each secret, in **Repository access**, select `JYRRY/JYRY-AI`.

   **Why `JYRY_ARCHIVE_EMAIL` is needed as a Codespaces secret:** the deploy script (`scripts/deploy-to-supabase.sh`) reads it from the Codespace shell and pushes it as a Supabase Edge Function secret so `gmail.ts` can inject it into the `Bcc:` header on every outgoing application. Without this secret, the deploy sets it to an empty string and archiving is disabled. The value is just the plain email address — no quotes, no angle brackets.

3. **Rebuild your Codespace** so the new secrets load:
   - In Codespaces, press `Ctrl+Shift+P` → type **Codespaces: Rebuild Container** → Enter.

---

## Task 2 — Deploy the Agents to Supabase (= connect Supabase ↔ Agents)

**Goal:** the 8 Edge Functions live on Supabase and can read/write your new database.

> ⚠️ **Copy-paste gotcha:** Never copy angle brackets (`< >`) into the terminal. In bash they mean "redirect input/output", so a command like `… <my-ref>` dies with `syntax error near unexpected token 'newline'`. Always replace the whole `<placeholder>` with a plain value — no brackets.

After Task 1 is done and the Codespace rebuilt, open the Codespace terminal and run these **two commands** (paste them exactly, then change only the value after `=`):

```bash
export PROJECT_REF=paste-your-16-char-id-here
bash scripts/deploy-to-supabase.sh "$PROJECT_REF"
```

Set `PROJECT_REF` to the 16-character ID you copied in step 1.1 — plain letters/numbers only, no `<`, no `>`, no quotes.

The script will:
1. Link the repo to your Supabase project.
2. Push the database schema (creates all 11 tables + RLS + triggers).
3. Seed 10 real Ausbildung companies.
4. Set all agent secrets (Anthropic, OpenAI, Google, encryption key).
5. Deploy all 8 Edge Functions.
6. Print your anon key at the end.

**Test it worked.** The deploy script printed your anon key at the end — copy it (the long `eyJ...` string) and set it as an env var in the same terminal, then run the curl. No angle brackets anywhere:

```bash
export ANON_KEY=paste-the-eyJ-anon-key-here
curl -X POST \
  "https://$PROJECT_REF.supabase.co/functions/v1/german-teacher" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"free_chat","message":"Hallo"}'
```
(This will fail with `invalid jwt` — that's expected, it means the function is live and JWT validation is working. Real requests come from authenticated Framer users. If instead you see `Bad hostname`, you copied the `<` or `>` into the URL — remove them.)

---

## Task 3 — Wire Framer to Supabase + Agents

**Goal:** the Framer frontend talks to Supabase Auth, Storage, Realtime, and invokes the Agents.

### 3.1 Get your Supabase public keys

1. Go to `https://supabase.com/dashboard/project/YOUR_PROJECT_REF/settings/api` (paste your real 16-char ref in place of `YOUR_PROJECT_REF` — no angle brackets).
2. Copy **two values**:
   - **Project URL** (e.g. `https://abc...supabase.co`)
   - **anon public** key (long JWT starting with `eyJ...`)

### 3.2 Paste the Code Components

> Framer does **not** have runtime env vars like Next.js. Instead, you paste the URL + anon key directly into the shared `framer-client` component. Both are public values (safe in a browser bundle), so hardcoding is correct.

In Framer, left sidebar → **Assets** → **Code** → **+ New File** — for each file below, create a matching Code Component:

1. **First** create `framer-client.ts` (every other component imports from it):
   - Paste the contents of `framer/framer-client.ts`.
   - Replace the two placeholder lines at the top with your real values from 3.1:
     ```ts
     const SUPABASE_URL = "https://wuclpdacbgablvtzqmyk.supabase.co";
     const SUPABASE_ANON_KEY = "eyJhbGciOi...your anon key...";
     ```
2. Then create the rest (exact names matter):
   - `useSupabaseAuth.tsx`
   - `WorkflowStepCard.tsx`
   - `DocumentUploader.tsx`
   - `ApplicationsList.tsx`
   - `NotificationBell.tsx`

### 3.4 Enable Google OAuth (needed for Gmail sending)

1. In Supabase dashboard → **Authentication** → **Providers** → **Google** → toggle **Enable**.
2. You'll see a **redirect URL** — copy it (format: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`).
3. Open https://console.cloud.google.com/apis/credentials → **+ Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: paste the Supabase callback URL from step 2.
   - Authorized JavaScript origins: your Framer domain (e.g. `https://jyry.framer.website`).
4. Copy the **Client ID** and **Client Secret**.
5. Paste both back into the Supabase Google provider settings.
6. In **Scopes**, add:
   ```
   email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly
   ```
7. Save.
8. In Codespaces, add the same Google creds as Codespaces secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
9. Re-run `bash scripts/deploy-to-supabase.sh "$PROJECT_REF"` in the same terminal so the Edge Functions get them. (If you opened a new terminal, run `export PROJECT_REF=paste-your-16-char-id-here` first.)

### 3.5 Storage buckets + webhook

In Supabase dashboard → **Storage**:

1. If not already created, click **New Bucket**:
   - Name: `user-docs` — **Private** — max file size 20 MB.
   - Name: `generated` — **Private** — max file size 10 MB.
2. In **Database** → **Webhooks** → **Create a new hook**:
   - Name: `process-upload-trigger`
   - Table: `storage.objects`
   - Events: `Insert`
   - Type: **Supabase Edge Function** → function = `process-upload`.

Now every time Framer uploads a file, the `process-upload` agent runs automatically.

### 3.6 Schedule the inbox poll

In **SQL Editor**, paste the block below, then **manually replace `YOUR_PROJECT_REF` with your real 16-char ref** (no angle brackets) before clicking Run:
```sql
select cron.schedule(
  'poll-inbox-15min',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-inbox',
       headers := jsonb_build_object('content-type','application/json')
     ) $$
);
```
This polls user Gmail inboxes every 15 minutes.

---

## You're done

The flow works end-to-end:

1. User signs in via Google in Framer → Supabase Auth stores their Gmail refresh token.
2. User uploads Zeugnis → Storage webhook → `process-upload` agent extracts fields.
3. User clicks "Find my Ausbildung" in Framer → `advisor` agent returns matches.
4. User clicks a company → `generate-cv` + `generate-letter` run → PDFs appear.
5. User clicks "Send" → `send-application` agent sends the email from their own Gmail.
6. Every 15 minutes → `process-inbox` agent triages replies → Framer notification updates in real time via Supabase Realtime.

## If something breaks

- **All agent logs**: Supabase dashboard → **Edge Functions** → pick function → **Logs**.
- **Database queries**: Supabase dashboard → **SQL Editor** → `select * from agent_runs order by created_at desc limit 20;`
- **Workflow state**: `select * from workflow_steps where user_id = 'paste-user-uuid-here';`
- **Cost per run**: `select agent, model, cost_usd from agent_runs order by created_at desc;`
