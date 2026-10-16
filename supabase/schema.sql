-- Run in the Supabase SQL editor after creating a project.
-- The service role key is server-only. Never put it in VITE_ variables.
create table if not exists public.growth_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('assessment_started','report_completed','qualified_lead')),
  source text not null default 'direct',
  mode text,
  created_at timestamptz not null default now()
);

create table if not exists public.consented_leads (
  id bigint generated always as identity primary key,
  name text not null default '',
  contact text not null,
  source text not null default 'direct',
  language text not null default 'en',
  answers jsonb not null,
  report_summary text not null default '',
  consent boolean not null check (consent = true),
  consent_at timestamptz not null,
  status text not null default 'new' check (status in ('new','contacted','qualified','closed')),
  created_at timestamptz not null default now()
);

alter table public.growth_events enable row level security;
alter table public.consented_leads enable row level security;

-- No anon/authenticated policies are intentionally created: browser clients cannot
-- read or write these tables. Server writes use the service role key. Add a real
-- authenticated admin policy before exposing a private metrics dashboard.
