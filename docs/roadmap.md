# THE BUILD ROADMAP

> JYRY-AI execution plan consumed by JYRY Command Center. Parser reads `### WEEK N — Milestone Name` headings and `- [ ] task` checkboxes. Completed work is marked `[x]`.

---

### WEEK 1 — Foundation Infrastructure
- [x] Initialize Supabase project with Auth, Storage, Edge Functions, Realtime
- [x] Author migrations 0001 through 0006 covering profiles companies applications workflow_steps
- [x] Enable Row Level Security on every user-scoped table
- [x] Configure Google OAuth provider with gmail.send and gmail.readonly scopes
- [x] Encrypt user_email_credentials.refresh_token with pgsodium
- [x] Provision Storage buckets user-docs (private 20MB) and generated (private 10MB)
- [x] Wire process-upload Storage webhook in supabase/config.toml

**Exit Criteria** Local supabase start succeeds, db reset applies all migrations cleanly, RLS denies cross-user reads.

---

### WEEK 2 — Agent Engine and Edge Functions
- [x] Build _shared/claude.ts with prompt caching retries and agent_runs logging
- [x] Build _shared/auth.ts extracting user_id from JWT sub claim
- [x] Build _shared/workflow.ts advancing workflow_steps state machine
- [x] Build _shared/gmail.ts for refresh-token exchange and MIME message construction
- [x] Implement process-upload using Claude Haiku vision for document field extraction
- [x] Implement advisor using Claude Opus for company shortlist ranking
- [x] Implement generate-cv producing Lebenslauf PDF in DIN-5008 layout
- [x] Implement generate-letter producing Anschreiben PDF tailored per company
- [x] Implement send-application with idempotency_key preventing double-send
- [x] Implement process-inbox cron polling every 15 minutes
- [x] Implement german-teacher correction agent
- [x] Implement workflow-advance agent

**Exit Criteria** All eight Edge Functions pass tsc, deploy to hosted project, and respond to fixture inputs via the CLI harness.

---

### WEEK 3 — Data and Content Curation
- [x] Curate 50 Pflegefachmann employers in Bayern via Google Sheets
- [x] Connect Google Sheets MCP server for autonomous data sync
- [x] Connect Supabase MCP server for autonomous schema operations
- [x] Insert all 50 Bayern companies into companies table
- [x] Drop premature unique constraint on companies.email allowing branch sharing
- [ ] Verify each Bayern employer email by sending a test message and recording delivery status
- [ ] Curate and insert 50 employers in Berlin
- [ ] Curate and insert 50 employers in Nordrhein-Westfalen
- [ ] Curate and insert 50 employers in Baden-Württemberg
- [ ] Curate and insert 50 employers in Hamburg
- [ ] Refine advisor system prompt with Bavarian region context
- [ ] Refine generate-letter prompt with employer-tone heuristics

**Exit Criteria** At least 5 Bundesländer have 50 verified employers each, and advisor returns ranked shortlists in under 3 seconds for 90 percent of test profiles.

---

### WEEK 4 — Framer Frontend Surfaces
- [x] DocumentUploader component with direct Storage upload
- [x] WorkflowStepCard component subscribed to workflow_steps Realtime channel
- [x] ApplicationsList component
- [x] NotificationBell component
- [x] useSupabaseAuth hook with Google sign-in and Gmail scope grant
- [ ] OnboardingFlow component covering Bundesland specialty German level and target start date
- [ ] CompanyShortlist component rendering advisor results with German rationale
- [ ] DocumentPreview component embedding generated PDF before send
- [ ] InboxView component grouping triaged replies by category invitation rejection question
- [ ] InterviewScheduler component triggered when triage detects an invitation
- [ ] SettingsPage component for Gmail reconnection and document refresh

**Exit Criteria** A new user can sign in upload documents pick a Bundesland see ranked companies preview a generated Anschreiben and trigger send entirely from the Framer UI.

---

### WEEK 5 — Quality Hardening and End-to-End Testing
- [ ] Run a complete end-to-end flow from upload to interview-booked for one synthetic user
- [ ] Native-German review of three Lebenslauf samples covering Bayern Berlin and NRW employers
- [ ] Native-German review of five Anschreiben samples covering different employer tones
- [ ] Send a real test application via Gmail and confirm delivery to a controlled inbox
- [ ] Run process-inbox against a controlled inbox seeded with diverse reply types
- [ ] Measure prompt cache hit rate over 50 user sessions and ensure it exceeds 70 percent
- [ ] Measure cost per user across 10 applications and ensure it stays under 0.50 euros
- [ ] Add a synthetic-attacker integration test that proves RLS blocks cross-user reads
- [ ] Tighten retries in _shared/claude.ts for 429 and 529 responses

**Exit Criteria** All quality gates met: native review approves output, cost stays under budget, cache hits exceed 70 percent, and the attacker test passes.

---

### WEEK 6 — Beta Launch
- [ ] Configure custom domain jyrygroup.com in Framer dashboard pointing at the Framer site
- [ ] Update Supabase Auth Redirect URLs adding jyrygroup.com
- [ ] Update Google Cloud OAuth credentials with new authorized origins and redirect URIs
- [ ] Provision Supabase log alerts for Edge Function errors and cost overruns
- [ ] Recruit five real beta users from a curated waitlist
- [ ] Capture written qualitative feedback from each beta user after first week
- [ ] Triage feedback and implement the top five improvements
- [ ] Compute true cost per user and update pricing model accordingly

**Exit Criteria** Five beta users have each sent at least three applications and at least two interviews are confirmed.

---

### WEEK 7 — Geographic and Vertical Expansion
- [ ] Curate the remaining 11 Bundesländer reaching 800+ verified employers
- [ ] Add Pflegehilfe specialty alongside Pflegefachmann
- [ ] Add Mechatroniker specialty with employer curation
- [ ] Add Hotelfachmann specialty with employer curation
- [ ] Add Outlook OAuth alongside Gmail with provider abstraction in _shared/email.ts
- [ ] Internationalize Framer UI to support Arabic English and German
- [ ] Persist user UI language preference in profiles table

**Exit Criteria** Catalog covers all 16 Bundesländer across 4 specialties and the UI renders correctly in 3 languages.

---

### WEEK 8 — Differentiation Features
- [ ] Build Interview Prep agent generating role-specific practice questions in German plus Arabic translation
- [ ] Build Rejection Learning agent extracting reason from rejection replies and improving next letter prompt context
- [ ] Build Smart Followup that auto-sends a polite check-in 14 days after silence
- [ ] Build Application Velocity dashboard showing applications per week response rate and time-to-interview
- [ ] Build Daily Standup notification summarizing yesterday's events and today's recommended actions
- [ ] Build Document Version Control letting users compare CV revisions across sessions
- [ ] Build Bilingual Contract Review agent activated when a contract attachment is detected in a reply

**Exit Criteria** All seven differentiation features ship to production and are surfaced in the Framer UI with usage tracking in agent_runs.

---

### WEEK 9 — Growth and Acquisition
- [ ] Ship Landing page in Arabic and German with conversion-optimized hero
- [ ] Produce a 90-second explainer video demonstrating upload to interview flow
- [ ] Publish three short-form video case studies featuring beta users with consent
- [ ] Sign content partnerships with three German language schools in Jordan or Egypt
- [ ] Implement in-app referral program with reward tiers
- [ ] Build admin dashboard surfacing aggregate metrics across all users with anonymization
- [ ] Generate first monthly report covering interviews booked cost per interview and user satisfaction

**Exit Criteria** Landing page launched, three partnership agreements signed, referral program live, and the first public monthly report is published.

---

### WEEK 10 — Operational Maturity
- [ ] Migrate Supabase to a Pro tier project with point-in-time recovery
- [ ] Set up automated backups of generated Storage bucket weekly to cold archive
- [ ] Implement rate limiting on send-application keyed per user per day
- [ ] Build a circuit breaker around Anthropic API to fail gracefully during outages
- [ ] Document the full runbook covering token rotation cron failures and triage spam
- [ ] Train a backup operator on the runbook and have them resolve a synthetic incident
- [ ] Define and publish the SLA covering response time and uptime targets

**Exit Criteria** Operational runbook is exercised end-to-end by a non-author and the system survives one synthetic incident without manual intervention.

---

### WEEK 11 — Voice and Multimodal Input
- [ ] Build voice-recording component letting users tell their story in Arabic
- [ ] Add Whisper-based transcription via Anthropic-friendly proxy
- [ ] Feed transcript into generate-cv as additional context for personality-rich Lebenslauf
- [ ] Build pre-Ausbildung checklist agent generating passport visa health-insurance and accommodation tasks
- [ ] Surface checklist in Framer with completion tracking

**Exit Criteria** A user with limited writing ability can produce a complete Lebenslauf and Anschreiben using only voice input.

---

### WEEK 12 — Long-Term User Value
- [ ] Build accepted-offer workflow extension covering visa application accommodation booking and arrival prep
- [ ] Build alumni network feature connecting current applicants with users already in Ausbildung
- [ ] Build Ausbildung experience review surface anonymously rating employers post-start
- [ ] Use review data to refine advisor ranking with employer quality signal
- [ ] Publish first employer quality leaderboard for active Bundesländer

**Exit Criteria** At least 20 users have completed the post-acceptance workflow and the advisor uses real employer quality data in its ranking.

---

# PARALLEL TRACK — Operations

## ONGOING — Data Curation
- [ ] Audit one Bundesland per week for stale employer data
- [ ] Investigate every bounced application within 24 hours
- [ ] Add three new specialties per quarter based on demand signal

## ONGOING — Content Quality
- [ ] Review one Anschreiben per day from production output and log issues
- [ ] Maintain a regression set of 20 Lebenslauf gold samples
- [ ] Refresh the advisor prompt monthly based on user choice patterns

## ONGOING — Cost and Performance
- [ ] Watch Anthropic spend daily and alert on 20 percent week-over-week jumps
- [ ] Audit prompt cache hit rate weekly and tune cache_control placement
- [ ] Profile Edge Function cold-start times monthly

## ONGOING — Security
- [ ] Rotate the EMAIL_TOKEN_ENCRYPTION_KEY every 90 days
- [ ] Run a quarterly RLS attacker test simulating account takeover attempts
- [ ] Review Supabase advisor recommendations weekly via mcp__Supabase__get_advisors
