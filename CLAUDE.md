# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⏳ Pending tasks (remind the user when relevant)

- **Custom domain migration**: User owns `jyrygroup.com` but the project currently uses `jyry.framer.website`. When the user is ready to switch:
  1. Configure custom domain in Framer dashboard (point `jyrygroup.com` to the Framer site).
  2. Update Supabase → Authentication → URL Configuration → Redirect URLs: replace/add `https://jyrygroup.com/**`.
  3. Update Google Cloud Console OAuth credentials → Authorized JavaScript origins + Authorized redirect URIs to use `jyrygroup.com`.
  4. No code changes required (the anon key + Supabase URL stay the same).

## What this is

JYRY-AI is a **workflow-based** (not chat) AI platform that helps users land a German Ausbildung. The user uploads documents once; AI agents generate a German Lebenslauf + Anschreiben per company, send applications through the user's own Gmail/Outlook, triage replies, and advance a visible workflow state machine. Frontend lives in Framer; backend and all AI live here.

## Development commands

```bash
supabase start                            # local Postgres + Auth + Storage + Functions
supabase db reset                         # apply all migrations + seed.sql
supabase db diff -f <name>                # generate a new migration from current local DB
supabase functions serve --env-file .env.local    # hot-reload all Edge Functions locally
supabase functions serve generate-cv --env-file .env.local   # serve one
pnpm run agent -- <agent> --fixture <name>        # invoke an agent locally via CLI (no deploy)
pnpm run functions:deploy                 # deploy all functions to hosted project
pnpm run typecheck                        # tsc --noEmit across agents/ and framer/
```

Edge Functions run on Deno (not Node). They `import` from URLs (`https://esm.sh/...`, `jsr:@supabase/...`). Do not add them to `package.json`. The root `package.json` is only for `agents/` and `framer/` (Node/TS).

## Architecture

### Two runtimes, one repo
- **Node/TS** (`agents/`, `framer/`) — runs locally via `tsx` and inside Framer. Uses the Anthropic SDK from npm.
- **Deno** (`supabase/functions/`) — runs in Supabase Edge Runtime. Uses `npm:` / `jsr:` / `https://esm.sh/` imports.

Agents share their **prompts** (`agents/prompts/*.md`) and **schemas** (`agents/schemas/*.ts`) between the two runtimes: Edge Functions read the markdown at cold start via `Deno.readTextFileSync`, and the CLI reads them via `fs`. This keeps one source of truth for prompts while letting both runtimes import them.

### The workflow state machine
`workflow_steps` is the single source of truth for "where is the user in the process". Keys in order:

```
upload → process → advisor → cv → letter → send → followup → interview
```

Every Edge Function that completes work calls `workflow-advance` (via direct DB update through `_shared/workflow.ts`) to mark its step `done` and the next step `pending`. The Framer frontend subscribes to `workflow_steps` via **Supabase Realtime**, so cards update without polling.

When adding a new step: add the key to `WORKFLOW_STEPS` in `supabase/functions/_shared/workflow.ts` *and* update the `CHECK` constraint in the migration. Both must match or RLS inserts will fail.

### Agent pattern
Every agent is a thin Edge Function that:
1. Validates input with a Zod schema from `agents/schemas/`.
2. Loads `profiles` + relevant context rows via the service-role Supabase client.
3. Calls `_shared/claude.ts:runClaude()` — which handles prompt caching (cache the system prompt + user profile block, ~5 min TTL), retries on 429/529, and logs `agent_runs`.
4. Writes its output to the appropriate table (`generated_documents`, `applications`, `notifications`, etc.).
5. Advances the workflow step.
6. Returns `{ data, error, agent_run_id }`.

**Model selection** (keep in `_shared/claude.ts`):
- `claude-opus-4-7` — Advisor only (complex reasoning over full profile).
- `claude-sonnet-4-6` — CV Generator, Letter Writer, German Teacher (quality writing).
- `claude-haiku-4-5-20251001` — Email Triage, Application Orchestrator (cheap, fast, tool-using).

**Prompt caching is mandatory** for every Claude call — a single user may run 10+ letters in a session. Cache the system prompt AND the user profile block. Check `agent_runs.cache_hit` when debugging cost.

### Security model (RLS)
Every user-scoped table has RLS enabled with a single policy: `user_id = auth.uid()`. Edge Functions bypass RLS by using the **service role key** — but that means **every function must manually scope queries with the JWT's `sub` claim**. Use `_shared/auth.ts:getUserId(req)` which extracts `sub` from the `Authorization: Bearer <jwt>` header; never trust a `user_id` in the request body.

Two tables have extra protection:
- `user_email_credentials.refresh_token_encrypted` — encrypted with `pgsodium` using `EMAIL_TOKEN_ENCRYPTION_KEY`. Decrypt only inside `_shared/gmail.ts`.
- `agent_runs` — read-only to users; service role only for inserts.

### Gmail integration
We use Supabase Auth's Google provider with extra scopes (`gmail.send`, `gmail.readonly`). The OAuth `refresh_token` is persisted server-side in `user_email_credentials` (encrypted) because Supabase Auth only keeps it in the session JWT. `_shared/gmail.ts` exchanges the refresh token for a short-lived access token, builds a MIME message (multipart/mixed with PDF attachments), and calls `gmail.googleapis.com/gmail/v1/users/me/messages/send`.

Inbox polling runs as a **Supabase cron job** (`select cron.schedule(...)`) hitting `process-inbox` every 15 minutes. Each run lists `threads` modified since `email_threads.last_checked_at`, pulls new messages, sends them to the Email Triage agent, and updates `applications.status` + creates notifications.

### Framer ↔ backend contract
Framer is not in this repo. The contract is:
- **Auth**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { scopes: 'gmail.send gmail.readonly' } })`.
- **Uploads**: direct-to-Storage from the browser (`supabase.storage.from('user-docs').upload(...)`). The `process-upload` function is triggered by a Storage webhook (configured in `supabase/config.toml`).
- **Agent invocation**: `supabase.functions.invoke('<agent>', { body: {...} })`. Never call the Anthropic API directly from Framer.
- **Realtime**: subscribe to `workflow_steps`, `notifications`, and `applications` filtered by `user_id=eq.<uid>`.

See `framer/INTEGRATION.md` for the full wiring and `framer/code-components/` for ready-to-import React components.

## Conventions

- **SQL migrations** are append-only. Never edit a committed migration — add a new one. Name them `NNNN_short_description.sql`.
- **Prompts** live in `agents/prompts/*.md` as plain markdown so a non-engineer can edit them. They are read at runtime; changes in Edge Functions require redeploy but no code change.
- **Schemas** (`agents/schemas/*.ts`) are Zod schemas shared between Node and Deno. Every agent's input AND output is validated.
- **Logging**: log through `agent_runs` (cost/tokens) and `notifications` (user-visible). Don't write to the global console for user-scoped events — logs must be queryable per user.
- **No service-role key in Framer**. Ever. Framer has only the anon key.
- **Idempotency**: `send-application` uses an `applications.idempotency_key` (UUID from the client) to prevent double-sends on retry.

## Adding a new agent

1. Write the system prompt in `agents/prompts/<name>.md`.
2. Define input/output Zod schemas in `agents/schemas/<name>.ts`.
3. Add a fixture in `agents/fixtures/<name>.json` so `pnpm run agent -- <name> --fixture ...` works.
4. Create `supabase/functions/<name>/index.ts` using the pattern in `supabase/functions/generate-cv/index.ts`.
5. If the agent advances workflow, add its step key to `WORKFLOW_STEPS` in `_shared/workflow.ts` AND the migration `CHECK` constraint.
6. Register it in `agents/cli.ts` for local testing.
7. Deploy: `supabase functions deploy <name>`.
