# Setup Guide — Connect Supabase, Agents, and Framer

This guide walks you through **three tasks** end-to-end. Do them in order. Every step tells you exactly where to click and what to copy.

> **You need, in this order:** a Supabase account → a Google Cloud account → a Framer project.

---

## Task 1 — Create Supabase project & set secrets

**Goal:** have a cloud database + Edge Function runtime ready.

### 1.1 Create the project

> Skip this sub-step if you already have the `jyry-ai` Supabase project.

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

> Skip this sub-step if the archive inbox already exists.

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
   | `ANTHROPIC_API_KEY`          | your Anthropic key (`sk-ant-...`) — powers every agent including OCR (Claude Haiku vision) |
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

> Run this once on first setup, and re-run it after every migration or after rotating any secret. The script is idempotent.

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
4. Set all agent secrets (Anthropic, Google, encryption key).
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

1. In Supabase dashboard → **Authentication** (left sidebar) → **Providers** → click **Google** to expand → toggle **Enable Sign in with Google**.
2. You'll see a **Callback URL** — copy it (format: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`).
3. Open https://console.cloud.google.com/apis/credentials → **+ Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: paste the Supabase callback URL from step 2.
   - Authorized JavaScript origins: your Framer domain (e.g. `https://jyry.framer.website`).
4. Copy the **Client ID** and **Client Secret**.
5. Back in Supabase → paste them into the two fields on the Google provider page:
   - `Client ID (for OAuth)` ← paste Client ID here
   - `Client Secret (for OAuth)` ← paste Secret here
   - Click **Save**.

   > **Note — Gmail scopes are NOT configured in Supabase.** Supabase's Google provider page has **no Scopes field**. Don't look for it. The Gmail scopes (`gmail.send`, `gmail.readonly`) are requested by the browser at sign-in time via `signInWithOAuth({ options: { scopes: '…' } })` in `framer/code-components/useSupabaseAuth.tsx` — already wired in the repo, you don't have to edit anything. Google will show those extra permissions on the consent screen the first time a user logs in.

6. In Codespaces, add the same Google creds as Codespaces secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
7. Re-run `bash scripts/deploy-to-supabase.sh "$PROJECT_REF"` in the same terminal so the Edge Functions get them. (If you opened a new terminal, run `export PROJECT_REF=paste-your-16-char-id-here` first.)

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

## Task 4 — Curate employer lists (the RAG list)

**Goal:** fill the `companies` table with admin-verified Ausbildung employers, one list per Bundesland. When a client on Framer picks a state + specialty, the `advisor` agent filters this table by SQL and asks Claude to rank the shortlist. No vector search, no random matches.

### 4.1 Make one CSV per Bundesland

Open Excel/Google Sheets and create a file like `bayern.csv` with these columns:

```
name,email,address,website,ausbildung_types,description,bundesland
```

- `ausbildung_types` is a Postgres `text[]` literal — values separated by commas inside `{ }`, e.g. `{Fachinformatiker,Industriekaufmann}`.
- If you're preparing the list in Excel with semicolon-joined types in column E, convert to the `{ }` format with this formula in a helper column:
  ```excel
  ="{"&SUBSTITUTE(E2,";",",")&"}"
  ```
- `bundesland` must match one of: `Baden-Württemberg, Bayern, Berlin, Brandenburg, Bremen, Hamburg, Hessen, Mecklenburg-Vorpommern, Niedersachsen, Nordrhein-Westfalen, Rheinland-Pfalz, Saarland, Sachsen, Sachsen-Anhalt, Schleswig-Holstein, Thüringen` (the CHECK constraint enforces this).

Minimum viable set: ~50 companies per Bundesland × 16 states. Target set: ~1,500 per state. See §5 for where to source them.

### 4.2 Import via Supabase Table editor

1. Supabase dashboard → **Table editor** (left sidebar) → click `companies`.
2. Click **Insert** ▾ → **Import data from CSV**.
3. Upload your `bayern.csv`.
4. Review the column mapping — leave `id` and `created_at` to auto-generate.
5. Click **Import**. 1,500 rows take ~10 seconds.

Repeat for each state. The `companies_bundesland_idx` and `companies_types_gin` indexes make filtering fast.

### 4.3 Verify

In SQL editor:
```sql
select bundesland, count(*) from companies group by 1 order by 1;
select * from companies where bundesland='Bayern' and 'Fachinformatiker' = any(ausbildung_types) limit 5;
```

---

## Task 5 — Where to get 1,500+ employers per Bundesland

No scraper lives in this repo — building these CSVs is a one-time human workflow per state. Use these sources, in this order:

| Source | URL | Coverage | Has email? | Cost |
|---|---|---|---|---|
| **Bundesagentur für Arbeit Jobsuche API** | https://jobsuche.api.bund.dev | ~80 % of all Ausbildung postings in DE, filterable by Bundesland + Beruf | Sometimes (in `stellenbeschreibung`) | Free, public API |
| **IHK-Lehrstellenbörse** | https://www.ihk-lehrstellenboerse.de | All IHK-registered employers, per-state portals | Often direct email | Free |
| **Ausbildung.de** | https://www.ausbildung.de | ~40k employers, state + field filters | Contact form; HR email when listed | Free, no API |
| **Azubiyo** | https://www.azubiyo.de | ~30k employers | Mixed | Free |
| **Handwerkskammer (HWK) portals** | per-state, e.g. https://www.hwk-berlin.de | Handwerk employers (Kfz, SHK, Elektro, …) | Listed | Free |
| **Handelsregister** | https://www.handelsregister.de | Full German company registry; use for verification | No (addresses only) | Free search |
| **Manual VA on Fiverr / Upwork** | — | Fills the email gap from any of the above | Yes (verified) | ~€0.05–€0.10 / row → €75–€150 per 1,500-row state |

### Recommended workflow to reach ~1,500 per state

1. **Baseline (~800):** Pull Ausbildung postings from the Bundesagentur Jobsuche API. Filter by `arbeitsort.plz` (the PLZ ranges of the target Bundesland) and `angebotsart=4` (Ausbildung). JSON in, CSV out with `kundenname`, `arbeitsort`, `beruf`. One script run.
2. **IHK top-up (~400):** Open the IHK-Lehrstellenbörse portal for that state, export or copy 300–400 more with direct emails (many entries list them).
3. **Specialty gaps (~300):** Search Ausbildung.de + the state Handwerkskammer for any Berufe still underrepresented in your list.
4. **Email enrichment:** Hand the combined spreadsheet to a VA on Fiverr/Upwork with the instruction "verify the ausbildung contact email (format: `ausbildung@…` or HR), drop rows you can't verify". 2–3 days, ~€100.
5. **Import:** Save as `bundesland-name.csv`, follow §4.2.

---

## You're done

The flow works end-to-end:

1. User signs in via Google in Framer → Supabase Auth stores their Gmail refresh token (scopes granted on the Google consent screen, not in Supabase).
2. User uploads Zeugnis → Storage webhook → `process-upload` agent extracts fields via Claude Haiku vision.
3. User picks **Bundesland + specialty** in Framer → `advisor` agent runs a SQL filter on your curated `companies` list → Claude ranks the shortlist with German reasons.
4. User clicks a company → `generate-cv` + `generate-letter` run → PDFs appear.
5. User clicks "Send" → `send-application` agent sends the email from their own Gmail, BCC'd to `JYRY_ARCHIVE_EMAIL`.
6. Every 15 minutes → `process-inbox` agent triages replies; only real human replies are forwarded to the archive inbox (auto-acknowledgments are skipped). Framer notifications update in real time via Supabase Realtime.

## If something breaks

- **All agent logs**: Supabase dashboard → **Edge Functions** → pick function → **Logs**.
- **Database queries**: Supabase dashboard → **SQL Editor** → `select * from agent_runs order by created_at desc limit 20;`
- **Workflow state**: `select * from workflow_steps where user_id = 'paste-user-uuid-here';`
- **Cost per run**: `select agent, model, cost_usd from agent_runs order by created_at desc;`
