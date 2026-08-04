-- =====================================================================
-- AGENT ACTIVITY LOGS — Báo cáo tiến độ hàng ngày của Admin 2 (Agent)
-- Idempotent — chạy nhiều lần OK. Chạy trong Supabase SQL Editor.
-- =====================================================================

create table if not exists public.agent_activity_logs (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references auth.users(id) on delete cascade,
  bangchu_id        uuid references public.bangchu(id) on delete set null,
  report_date       date not null default (now() at time zone 'utc')::date,
  fb_posts_count    integer not null default 0 check (fb_posts_count    >= 0),
  zalo_members_count integer not null default 0 check (zalo_members_count >= 0),
  violation_links   text[] not null default '{}',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists agent_activity_logs_agent_idx
  on public.agent_activity_logs (agent_id, report_date desc);
create index if not exists agent_activity_logs_date_idx
  on public.agent_activity_logs (report_date desc);

-- updated_at trigger
create or replace function public.tg_agent_activity_logs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_agent_activity_logs_touch on public.agent_activity_logs;
create trigger trg_agent_activity_logs_touch
  before update on public.agent_activity_logs
  for each row execute function public.tg_agent_activity_logs_touch();

-- GRANTS (Data API)
grant select, insert, update, delete on public.agent_activity_logs to authenticated;
grant all on public.agent_activity_logs to service_role;

-- RLS
alter table public.agent_activity_logs enable row level security;

drop policy if exists "agent self read"   on public.agent_activity_logs;
drop policy if exists "agent self insert" on public.agent_activity_logs;
drop policy if exists "agent self update" on public.agent_activity_logs;
drop policy if exists "admin1 read all"   on public.agent_activity_logs;

-- Agent (admin_2) xem được log của chính mình
create policy "agent self read" on public.agent_activity_logs
  for select to authenticated
  using (agent_id = auth.uid());

-- Agent chỉ insert log cho chính mình, và phải là bangchu active
create policy "agent self insert" on public.agent_activity_logs
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    and public.is_active_bangchu(auth.uid())
  );

-- Agent chỉnh sửa log của mình trong cùng ngày
create policy "agent self update" on public.agent_activity_logs
  for update to authenticated
  using (agent_id = auth.uid() and report_date = (now() at time zone 'utc')::date)
  with check (agent_id = auth.uid());

-- Admin_1 (Bang chủ) đọc toàn bộ
create policy "admin1 read all" on public.agent_activity_logs
  for select to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'));
