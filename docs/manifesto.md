# JYRY MANIFESTO

> Transform German Ausbildung applications from manual chaos into autonomous workflow.

---

## The Problem

Tens of thousands of young Arabs and other foreign nationals dream of an Ausbildung in Germany — care nursing, mechatronics, hospitality, retail. The current path is broken:

- Consultants charge thousands of euros for hollow promises
- WhatsApp groups spread contradictory advice
- Lebenslauf and Anschreiben templates are formatted wrong and rejected on sight
- Nobody knows which employer to apply to or when to follow up
- Replies vanish in inboxes nobody reads

The talent loses hope. The employer never finds the apprentice.

## The Mission

JYRY-AI replaces the broken funnel with a single workflow:

> Upload your documents once. AI agents write your German CV and Anschreiben in DIN-5008 form, send applications from your own Gmail, watch for replies, and move you visibly through the pipeline until you sit in the interview chair.

## The Five Principles

### 1. Workflow, Not Chat
The AI **does the work** — it does not give advice. Every step has a visible state on a swim lane: `upload → process → advisor → cv → letter → send → followup → interview`. The user sees progress, not prompts.

### 2. The User's Inbox, Not Ours
Applications are sent from the user's personal Gmail. The employer sees a real human, not a bot. JYRY stays invisible behind the scenes.

### 3. Native German Writing
- Lebenslauf in DIN-5008 layout
- Anschreiben in employer-appropriate professional German tone
- No machine translation — Claude writes in German from scratch with the user's profile as context

### 4. Privacy by Default
- User documents stored in private Storage with RLS
- OAuth refresh tokens encrypted with pgsodium
- No retention of email content beyond what triage requires

### 5. Cost Transparency
- Every agent run logged in `agent_runs` with tokens and cost
- The user sees what the system is doing in real time via Supabase Realtime
- Prompt caching is mandatory — single user generating 10 letters must hit cache

## Target User

- Arabic or other foreign-speaking applicants, age 18-30
- German level A2-B2 (reads German, struggles with formal writing)
- Wants Ausbildung specifically (not Studium, not casual employment)
- Initial vertical: **Pflegefachmann/Pflegefachfrau** (nursing care)
- Initial market: **Bayern**, expanding to all 16 Bundesländer

## North Star

**Confirmed Ausbildung interviews per month per active user.**

Not signups. Not applications sent. **Interviews.** This is the only metric that aligns user value with employer value.

## What JYRY Is Not

- Not a job board — we don't list openings
- Not an interactive CV builder — the CV is generated, not designed
- Not a German tutor — the German Teacher agent corrects, it does not teach
- Not an immigration consultant — visa and relocation are out of scope
- Not chat — there is no "ask me anything" surface

## Engineering Philosophy

- **Two runtimes, one repo**: Node/TS for local agents and Framer, Deno for Edge Functions, sharing prompts and Zod schemas
- **Prompts as Markdown**: non-engineers can edit them
- **Cache-first**: every Claude call uses prompt caching
- **RLS strict**: every user-scoped table guarded by `user_id = auth.uid()`
- **No service-role key in Framer**: anon key only, ever
- **Idempotency on send**: applications cannot be double-sent under any condition

## Quality Bars

- If a generated Anschreiben has German errors, fix the prompt — never accept "good enough"
- Advisor must shortlist in < 3 seconds; letter generation < 8 seconds
- Cost per user sending 10 applications must stay under 0.50 €
- Prompt cache hit rate must stay > 70%

## Why This Wins

The competition is broken in a specific way: it asks the user to do work the AI should do. JYRY inverts that. The user provides identity (documents, Bundesland, target role); the system delivers outcomes (sent applications, replies, interviews). The user's role is to show up to the interview.

## Roadmap Sections

This manifesto pairs with `docs/roadmap.md`. The roadmap structures execution into weekly milestones tracked by JYRY Command Center. Operators run `prepare`, `auto`, `audit` against milestones; the parser consumes the checkbox tasks and routes them by tier and lane.
