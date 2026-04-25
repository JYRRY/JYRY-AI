# Setup Guide — Curate Companies

---

## Task 1 — Build the Bayern employer list (MVP)

**Goal:** fill the `companies` table with ~50 admin-verified Ausbildung employers in **Bayern** to test the end-to-end flow (advisor → letter → send). Once this works, repeat the same process for the other 15 Bundesländer.

### 1.1 Create `bayern.csv` in Google Sheets

Open **Google Sheets** → new sheet → paste this header in row 1 (lowercase, exactly):

```
name,email,ausbildung_types,bundesland,region,address
```

The first four columns are required. `region` and `address` are optional but recommended.

**Per-column rules:**

| Column | Required | Rule |
|---|---|---|
| `name` | ✅ | Legal company name, e.g. `Siemens AG`. |
| `email` | ✅ | Prefer `ausbildung@…` or an HR address. If no verified email, skip the row. |
| `ausbildung_types` | ✅ | Postgres array literal — see format below. |
| `bundesland` | ✅ | Always the **state name** (`Bayern`). The CHECK constraint rejects anything else. |
| `region` | optional | City or district inside the state (`München`, `Passau`, `Augsburg`). Stored for future filtering — the advisor ignores it today. |
| `address` | optional but recommended | Full street + PLZ + city, e.g. `Werner-von-Siemens-Str. 1, 80333 München`. Used in the Anschreiben Empfänger block. |

> ⚠️ **The most common import failure:** putting a city (`München`) in the `bundesland` column. Postgres silently stores `null`, then the row fails because `ausbildung_types` is NOT-NULL. **Always write `Bayern` in `bundesland`** — put the city in `region`.

**`ausbildung_types` format — important:**

- Type the value **directly into the cell** as: `{Pflegefachmann,Altenpfleger}`
- Rules:
  - Curly braces `{ }`, not square `[ ]`.
  - No spaces after commas — `{a,b}` ✅, `{a, b}` ❌.
  - No outer quotes.
  - If a single value contains a comma, wrap that value in double quotes: `{"Kaufmann für IT-Systemmanagement",Industriekaufmann}`.
- You do **not** need a formula. Just type the text. When you export to CSV, Supabase imports it as a real `text[]` because the column was defined that way in the migration.
- If you ever copy a formula result and want to paste it elsewhere, use **Paste values only** (`Ctrl+Shift+V`). "Paste format only" pastes styling without the text — wrong option.

**Export:** `File` → `Download` → `Comma-separated values (.csv)` → save as `bayern.csv`.

### 1.2 Import into Supabase

1. Supabase dashboard → **Table editor** (left sidebar) → click `companies`.
2. Click **Insert** ▾ → **Import data from CSV**.
3. Upload `bayern.csv`.
4. The headers match DB column names exactly, so the wizard auto-maps them. Leave `id` and `created_at` unmapped — Postgres generates them.
5. Click **Import**. 50 rows take ~2 seconds.

The `companies_bundesland_idx`, `companies_region_idx`, and `companies_types_gin` indexes are already in place from migrations `0002` and `0003`, so filtering stays fast as the table grows.

### 1.3 Verify

Supabase dashboard → **SQL Editor** → **New query** → paste and run:

```sql
-- 1. Bayern rows landed, array type was parsed correctly
select bundesland, count(*) from companies group by 1 order by 1;

-- 2. Ausbildungsberufe is a real array (not a text blob)
select name, ausbildung_types
from companies
where bundesland='Bayern' and array_length(ausbildung_types, 1) > 0
limit 3;

-- 3. The exact filter the advisor will run
select id, name, email, region from companies
where bundesland='Bayern' and 'Pflegefachmann' = any(ausbildung_types)
limit 5;
```

If query 2 shows `{Pflegefachmann,Altenpfleger}` (curly braces, no quotes around the whole thing) and query 3 returns rows, you're ready.

If query 2 shows `"{Pflegefachmann,Altenpfleger}"` (quoted) or the whole thing as text, the column was mapped wrong in §1.2 — delete the Bayern rows and re-import.

---

## Task 2 — Where to find Bayern employers

For the MVP, target **~50 Bayern employers** you can collect in one sitting. Scale to more rows (and other states) only after the end-to-end flow passes on this first batch. No scraper lives in this repo — this is a manual workflow. Use these sources:

| Source | URL | Coverage | Has email? | Cost |
|---|---|---|---|---|
| **Bundesagentur für Arbeit Jobsuche API** | https://jobsuche.api.bund.dev | ~80 % of all Ausbildung postings in DE, filterable by Bundesland + Beruf | Sometimes (in `stellenbeschreibung`) | Free, public API |
| **IHK-Lehrstellenbörse** | https://www.ihk-lehrstellenboerse.de | All IHK-registered employers, per-state portals | Often direct email | Free |
| **Ausbildung.de** | https://www.ausbildung.de | ~40k employers, state + field filters | Contact form; HR email when listed | Free, no API |
| **Azubiyo** | https://www.azubiyo.de | ~30k employers | Mixed | Free |
| **Handwerkskammer (HWK) portals** | per-state, e.g. https://www.hwk-berlin.de | Handwerk employers (Kfz, SHK, Elektro, …) | Listed | Free |
| **Handelsregister** | https://www.handelsregister.de | Full German company registry; use for verification | No (addresses only) | Free search |
| **Manual VA on Fiverr / Upwork** | — | Fills the email gap from any of the above | Yes (verified) | ~€0.05–€0.10 / row → €75–€150 per 1,500-row state |

### Fast path for the 50-row Bayern MVP

1. **IHK-Lehrstellenbörse Bayern** — open the Munich / Nürnberg / Augsburg chambers on `ihk-lehrstellenboerse.de`. Pick 30–40 listings that show a direct `ausbildung@…` or HR email. Copy `Name`, `E-Mail`, `Adresse`, and the `Ausbildungsberuf`.
2. **Ausbildung.de** — search by `Bayern` + the Ausbildungsberufe you want to test (e.g. `Fachinformatiker`, `Industriekaufmann`). Fill any specialty gaps from step 1.
3. **Verify each email** — open the company website, confirm the address is real. Drop rows where the email looks like a generic contact form submit address (`info@…` is fine; `noreply@…` is not).
4. **Import:** save as `bayern.csv`, follow Task 1.2.

### Scaling to the other 15 states (later)

Once the Bayern MVP works end-to-end, repeat steps 1–3 per state at larger scale:

1. **Baseline (~800):** Bundesagentur Jobsuche API. Filter by `arbeitsort.plz` (PLZ ranges of the target Bundesland) + `angebotsart=4` (Ausbildung). JSON in, CSV out with `kundenname`, `arbeitsort`, `beruf`.
2. **IHK top-up (~400):** state IHK-Lehrstellenbörse portal.
3. **Specialty gaps (~300):** Ausbildung.de + state Handwerkskammer.
4. **Email enrichment:** hand the spreadsheet to a VA on Fiverr/Upwork — "verify the Ausbildung contact email, drop rows you can't verify". 2–3 days, ~€100 per 1,500-row state.
5. **Import:** `<bundesland>.csv` via Task 1.2.

---

## The full user flow after setup

1. Client logs in via Google in Framer → Supabase Auth stores their Gmail refresh token (Gmail scopes are granted on the Google consent screen, not in Supabase).
2. Client uploads Zeugnis → Storage webhook → `process-upload` agent extracts fields via Claude Haiku vision.
3. Client picks **Bundesland + specialty** in Framer → `advisor` agent runs a SQL filter on your curated `companies` list → Claude Opus ranks the shortlist with German reasons for each match.
4. Client clicks a company → `generate-cv` + `generate-letter` agents run → PDFs appear in the `generated` bucket.
5. Client clicks "Send" → `send-application` agent sends the email from their own Gmail, BCC'd to `JYRY_ARCHIVE_EMAIL`.
6. Every 15 minutes → `process-inbox` agent polls their inbox; only human replies (invitations, rejections, questions) are forwarded to the archive inbox. Auto-acknowledgments are filtered out.

---

## If something breaks

- **All agent logs**: Supabase dashboard → **Edge Functions** → pick function → **Logs**.
- **Database queries**: Supabase dashboard → **SQL Editor** → `select * from agent_runs order by created_at desc limit 20;`
- **Workflow state**: `select * from workflow_steps where user_id = 'paste-user-uuid-here';`
- **Cost per run**: `select agent, model, cost_usd from agent_runs order by created_at desc;`
