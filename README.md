# JYRY-AI

AI-powered Ausbildung (German vocational training) platform. Users upload documents; AI agents generate German CVs and Anschreiben, send applications via the user's own Gmail/Outlook, and track replies.

**Stack**
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)
- **AI**: Claude API (all writing, reasoning, and OCR via Haiku vision)
- **Frontend**: Framer with Supabase JS SDK in Code Components
- **Email**: Gmail/Outlook OAuth from the user's own account

## Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env
cp .env.example .env.local
# Fill in keys (Anthropic, Google OAuth, Supabase)

# 3. Start local Supabase
supabase start
supabase db reset           # applies migrations + seed

# 4. Test an agent locally (no deploy needed)
pnpm run agent -- generate-cv --fixture user-01

# 5. Serve Edge Functions locally
supabase functions serve --env-file .env.local

# 6. Deploy to hosted Supabase
pnpm run functions:deploy
```

## Repository layout

- `supabase/migrations/` — Postgres schema (RLS on every table)
- `supabase/functions/` — Deno Edge Functions, one per agent + orchestrator
- `agents/` — System prompts, Zod schemas, CLI test harness, fixtures
- `framer/` — Framer Code Components (React) + integration guide

See [CLAUDE.md](./CLAUDE.md) for architecture, conventions, and how to add new agents.
