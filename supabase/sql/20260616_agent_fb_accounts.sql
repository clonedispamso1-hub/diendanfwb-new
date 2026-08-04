-- =====================================================================
-- AGENT FB ACCOUNTS — Báo cáo nick Facebook do Admin 2 (Agent) quản lý
-- Idempotent — chạy nhiều lần OK. Chạy trong Supabase SQL Editor.
-- =====================================================================

create table if not exists public.agent_fb_accounts (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references auth.users(id) on delete cascade,
  bangchu_id    uuid references public.bangchu(id) on delete set null,
  report_date   date not null default (now() at time zone 'utc')::date,
  fb_uid        text not null,
  account_name  text,
  account_link  text,
  status        text not null default 'live' check (status in ('live','die')),
  groups_count  integer not null default 0 check (groups_count >= 0),
  posts_today   integer not null default 0 check (posts_today  >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists agent_fb_accounts_agent_date_idx
  on public.agent_fb_accounts (agent_id, report_date desc);
create index if not exists agent_fb_accounts_uid_idx
  on public.agent_fb_accounts (fb_uid);
create index if not exists agent_fb_accounts_date_idx
  on public.agent_fb_accounts (report_date desc);

create or replace function public.tg_agent_fb_accounts_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_agent_fb_accounts_touch on public.agent_fb_accounts;
create trigger trg_agent_fb_accounts_touch
  before update on public.agent_fb_accounts
  for each row execute function public.tg_agent_fb_accounts_touch();

-- GRANTS
grant select, insert, update, delete on public.agent_fb_accounts to authenticated;
grant all on public.agent_fb_accounts to service_role;

-- RLS
alter table public.agent_fb_accounts enable row level security;

drop policy if exists "fb agent self read"   on public.agent_fb_accounts;
drop policy if exists "fb agent self insert" on public.agent_fb_accounts;
drop policy if exists "fb agent self update" on public.agent_fb_accounts;
drop policy if exists "fb agent self delete" on public.agent_fb_accounts;
drop policy if exists "fb admin1 read all"   on public.agent_fb_accounts;

create policy "fb agent self read" on public.agent_fb_accounts
  for select to authenticated
  using (agent_id = auth.uid());

create policy "fb agent self insert" on public.agent_fb_accounts
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    and public.is_active_bangchu(auth.uid())
  );

create policy "fb agent self update" on public.agent_fb_accounts
  for update to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

create policy "fb agent self delete" on public.agent_fb_accounts
  for delete to authenticated
  using (agent_id = auth.uid());

create policy "fb admin1 read all" on public.agent_fb_accounts
  for select to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'));
