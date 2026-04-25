-- =========================================================
-- Schema cleanup: collect-now/filter-later region, drop dead columns
-- =========================================================

-- Add region for city/district inside the Bundesland (München, Passau, …).
-- Stored only — advisor still filters by bundesland alone for the MVP.
alter table public.companies
  add column region text;

create index companies_region_idx on public.companies(region);

-- Drop genuinely-unused columns. address is kept (Anschreiben Empfänger block).
alter table public.companies drop column if exists website;
alter table public.companies drop column if exists description;
