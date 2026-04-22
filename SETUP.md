# Setup Guide — Curate Companies

---

## Task 1 — Curate employer lists (the RAG foundation)

**Goal:** fill the `companies` table with admin-verified Ausbildung employers, one list per Bundesland. When a client on Framer picks a state + specialty, the `advisor` agent filters this table by SQL and asks Claude to rank the shortlist. No vector search, no random matches.

### 1.1 Make one CSV per Bundesland

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

Minimum viable set: ~50 companies per Bundesland × 16 states. Target set: ~1,500 per state. See Task 2 for where to source them.

### 1.2 Import via Supabase Table editor

1. Supabase dashboard → **Table editor** (left sidebar) → click `companies`.
2. Click **Insert** ▾ → **Import data from CSV**.
3. Upload your `bayern.csv`.
4. Review the column mapping — leave `id` and `created_at` to auto-generate.
5. Click **Import**. 1,500 rows take ~10 seconds.

Repeat for each state. The `companies_bundesland_idx` and `companies_types_gin` indexes make filtering fast.

### 1.3 Verify

In Supabase dashboard → **SQL Editor**, run:
```sql
select bundesland, count(*) from companies group by 1 order by 1;
select * from companies where bundesland='Bayern' and 'Fachinformatiker' = any(ausbildung_types) limit 5;
```

If both queries return results, you're ready.

---

## Task 2 — Where to get 1,500+ employers per Bundesland

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
5. **Import:** Save as `bundesland-name.csv`, follow Task 1.2.

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
