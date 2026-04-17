-- =========================================================
-- JYRY-AI initial schema
-- =========================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pgsodium";
create extension if not exists "pg_cron";

-- =========================================================
-- profiles
-- =========================================================
create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  address       text,
  birthdate     date,
  german_level  text check (german_level in ('A1','A2','B1','B2','C1','C2')),
  target_field  text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =========================================================
-- documents (user-uploaded source material)
-- =========================================================
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('zeugnis','cv_old','certificate','photo','other')),
  storage_path   text not null,
  original_name  text,
  mime_type      text,
  extracted_json jsonb,
  embedding      vector(1536),
  created_at     timestamptz not null default now()
);
create index documents_user_idx on public.documents(user_id);
create index documents_embedding_idx on public.documents using ivfflat (embedding vector_cosine_ops);

-- =========================================================
-- companies (Ausbildung employers directory)
-- =========================================================
create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text,
  address          text,
  website          text,
  ausbildung_types text[] not null default '{}',
  description      text,
  embedding        vector(1536),
  created_at       timestamptz not null default now()
);
create index companies_embedding_idx on public.companies using ivfflat (embedding vector_cosine_ops);

-- =========================================================
-- generated_documents (CV + letters produced by agents)
-- =========================================================
create table public.generated_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  application_id uuid,
  type           text not null check (type in ('cv','letter')),
  content_md     text not null,
  pdf_path       text,
  version        int  not null default 1,
  created_at     timestamptz not null default now()
);
create index generated_documents_user_idx on public.generated_documents(user_id);
create index generated_documents_app_idx  on public.generated_documents(application_id);

-- =========================================================
-- applications
-- =========================================================
create table public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  company_id       uuid not null references public.companies(id),
  status           text not null default 'draft'
                     check (status in ('draft','sent','replied','interview','rejected','accepted','withdrawn')),
  cv_doc_id        uuid references public.generated_documents(id),
  letter_doc_id    uuid references public.generated_documents(id),
  idempotency_key  uuid,
  sent_at          timestamptz,
  replied_at       timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index applications_user_idx on public.applications(user_id);
create index applications_status_idx on public.applications(user_id, status);

alter table public.generated_documents
  add constraint generated_documents_application_fk
  foreign key (application_id) references public.applications(id) on delete set null;

-- =========================================================
-- email_threads + email_messages
-- =========================================================
create table public.email_threads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  application_id   uuid references public.applications(id) on delete set null,
  gmail_thread_id  text not null,
  last_message_at  timestamptz,
  last_checked_at  timestamptz,
  category         text,
  created_at       timestamptz not null default now(),
  unique (user_id, gmail_thread_id)
);
create index email_threads_user_idx on public.email_threads(user_id);

create table public.email_messages (
  id                 uuid primary key default gen_random_uuid(),
  thread_id          uuid not null references public.email_threads(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  gmail_message_id   text not null,
  direction          text not null check (direction in ('in','out')),
  subject            text,
  body               text,
  sent_at            timestamptz,
  ai_classification  jsonb,
  created_at         timestamptz not null default now(),
  unique (gmail_message_id)
);
create index email_messages_thread_idx on public.email_messages(thread_id);

-- =========================================================
-- notifications (user-visible)
-- =========================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  action_url  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id) where read_at is null;

-- =========================================================
-- workflow_steps (state machine)
-- =========================================================
create table public.workflow_steps (
  user_id       uuid not null references auth.users(id) on delete cascade,
  step_key      text not null
                  check (step_key in ('upload','process','advisor','cv','letter','send','followup','interview')),
  status        text not null default 'pending'
                  check (status in ('pending','in_progress','done','failed','blocked')),
  completed_at  timestamptz,
  meta          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (user_id, step_key)
);

-- =========================================================
-- agent_runs (AI audit log)
-- =========================================================
create table public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  agent          text not null,
  model          text not null,
  input_tokens   int,
  output_tokens  int,
  cache_read_tokens   int,
  cache_write_tokens  int,
  cost_usd       numeric(10,6),
  duration_ms    int,
  status         text not null check (status in ('ok','error')),
  error_message  text,
  created_at     timestamptz not null default now()
);
create index agent_runs_user_idx on public.agent_runs(user_id, created_at desc);

-- =========================================================
-- user_email_credentials (encrypted OAuth tokens)
-- =========================================================
create table public.user_email_credentials (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  provider                 text not null check (provider in ('gmail','outlook')),
  email_address            text not null,
  refresh_token_encrypted  bytea not null,
  scopes                   text[] not null default '{}',
  expires_at               timestamptz,
  updated_at               timestamptz not null default now()
);

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles               enable row level security;
alter table public.documents              enable row level security;
alter table public.generated_documents    enable row level security;
alter table public.applications           enable row level security;
alter table public.email_threads          enable row level security;
alter table public.email_messages         enable row level security;
alter table public.notifications          enable row level security;
alter table public.workflow_steps         enable row level security;
alter table public.agent_runs             enable row level security;
alter table public.user_email_credentials enable row level security;
alter table public.companies              enable row level security;

-- user can see/write only their own rows
create policy "own rows" on public.profiles            for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.documents           for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.generated_documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.applications        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.email_threads       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.email_messages      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.notifications       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.workflow_steps      for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- agent_runs: read-only to user
create policy "read own runs" on public.agent_runs for select using (user_id = auth.uid());

-- user_email_credentials: no direct access (service role only)
-- (no policy => effectively blocked for anon/authenticated roles)

-- companies: readable by anyone authenticated
create policy "read companies" on public.companies for select using (auth.role() = 'authenticated');

-- =========================================================
-- updated_at trigger
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger touch_profiles       before update on public.profiles       for each row execute function public.touch_updated_at();
create trigger touch_applications   before update on public.applications   for each row execute function public.touch_updated_at();
create trigger touch_workflow_steps before update on public.workflow_steps for each row execute function public.touch_updated_at();

-- =========================================================
-- bootstrap: on new auth.users, create profile + initial workflow steps
-- =========================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));

  insert into public.workflow_steps(user_id, step_key, status) values
    (new.id, 'upload',    'pending'),
    (new.id, 'process',   'pending'),
    (new.id, 'advisor',   'pending'),
    (new.id, 'cv',        'pending'),
    (new.id, 'letter',    'pending'),
    (new.id, 'send',      'pending'),
    (new.id, 'followup',  'pending'),
    (new.id, 'interview', 'pending');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Vector match RPCs (used by advisor to match profile→companies)
-- =========================================================
create or replace function public.match_companies(
  query_embedding vector(1536),
  match_count     int default 10,
  filter_types    text[] default null
) returns table (
  id          uuid,
  name        text,
  email       text,
  address     text,
  website     text,
  ausbildung_types text[],
  similarity  float
) language sql stable as $$
  select c.id, c.name, c.email, c.address, c.website, c.ausbildung_types,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.companies c
  where c.embedding is not null
    and (filter_types is null or c.ausbildung_types && filter_types)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
