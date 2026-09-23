-- Supabase #4 — Cấu hình hệ thống "Tìm Xung Quanh"
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.

create table if not exists public.nearby_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.nearby_settings to anon, authenticated;
grant insert, update on public.nearby_settings to anon, authenticated;
grant all on public.nearby_settings to service_role;

alter table public.nearby_settings enable row level security;

drop policy if exists "nearby settings read" on public.nearby_settings;
create policy "nearby settings read" on public.nearby_settings
  for select to anon, authenticated using (true);

drop policy if exists "nearby settings insert" on public.nearby_settings;
create policy "nearby settings insert" on public.nearby_settings
  for insert to anon, authenticated with check (true);

drop policy if exists "nearby settings update" on public.nearby_settings;
create policy "nearby settings update" on public.nearby_settings
  for update to anon, authenticated using (true) with check (true);

insert into public.nearby_settings (key, value)
values ('system', '{"weeklyQuota":10,"onlineCount":20,"scanRate":70}'::jsonb)
on conflict (key) do nothing;
