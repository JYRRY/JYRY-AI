-- Sender's country — used by letter-writer to decide whether the Empfänger
-- block needs a "Deutschland" line (DIN 5008: omit for domestic mail,
-- add when applicant is sending from outside Germany).
alter table public.profiles
  add column country text default 'Deutschland';

comment on column public.profiles.country is
  'Country name in German (Deutschland, Syrien, Türkei, Ukraine, …). '
  'NULL or "Deutschland" → no country line in Empfänger block. '
  'Anything else → "Deutschland" appended as the 4th line of the recipient address.';
