-- =========================================================
-- RAG pivot: admin-curated companies per Bundesland
-- Removes vector search; advisor now filters by SQL and lets
-- Claude rank the shortlist directly.
-- =========================================================

alter table public.companies
  add column bundesland text check (bundesland in (
    'Baden-Württemberg','Bayern','Berlin','Brandenburg','Bremen','Hamburg',
    'Hessen','Mecklenburg-Vorpommern','Niedersachsen','Nordrhein-Westfalen',
    'Rheinland-Pfalz','Saarland','Sachsen','Sachsen-Anhalt','Schleswig-Holstein',
    'Thüringen'
  ));

create index companies_bundesland_idx on public.companies(bundesland);
create index companies_types_gin      on public.companies using gin (ausbildung_types);

-- Drop vector search machinery (no longer used)
drop function if exists public.match_companies(vector, int, text[]);
drop index    if exists public.companies_embedding_idx;
drop index    if exists public.documents_embedding_idx;

alter table public.companies drop column if exists embedding;
alter table public.documents  drop column if exists embedding;

-- pgvector extension is left enabled; harmless and keeps the door open.

-- Back-fill the 10 seed employers so the advisor can match them immediately.
update public.companies set bundesland = 'Berlin'             where name = 'Deutsche Bahn AG';
update public.companies set bundesland = 'Bayern'             where name = 'Siemens AG';
update public.companies set bundesland = 'Bayern'             where name = 'BMW Group';
update public.companies set bundesland = 'Hamburg'            where name = 'Lufthansa Technik';
update public.companies set bundesland = 'Baden-Württemberg'  where name = 'Bosch GmbH';
update public.companies set bundesland = 'Baden-Württemberg'  where name = 'SAP SE';
update public.companies set bundesland = 'Bayern'             where name = 'Allianz Deutschland AG';
update public.companies set bundesland = 'Nordrhein-Westfalen' where name = 'REWE Group';
update public.companies set bundesland = 'Nordrhein-Westfalen' where name = 'Vonovia SE';
update public.companies set bundesland = 'Berlin'             where name = 'Charité Berlin';
