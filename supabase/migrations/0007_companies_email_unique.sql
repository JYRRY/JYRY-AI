alter table public.companies
  add constraint companies_email_unique unique (email);
