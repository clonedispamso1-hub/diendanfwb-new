-- ============================================================
-- Kết nối (Radar Match) — chạy 1 lần trong SQL Editor của Supabase.
-- An toàn khi chạy lại nhiều lần (idempotent).
-- ============================================================

-- 1) Bảng cấu hình Kết nối (Admin Panel đọc/ghi)
create table if not exists public.connect_settings (
  id integer primary key default 1,
  enabled boolean not null default true,
  packet_count integer not null default 28,
  fall_speed integer not null default 190,
  fall_speed_jitter integer not null default 70,
  spawn_gap_ms integer not null default 260,
  duration_sec integer not null default 9,
  cooldown_hours integer not null default 24,
  reward_min numeric not null default 0.1,
  reward_max numeric not null default 2,
  reward_table jsonb not null default '[{"value":0.5,"weight":50},{"value":1,"weight":35},{"value":2,"weight":15}]'::jsonb,
  scan_costs jsonb not null default '{"3":0.5,"5":1,"10":2,"15":3}'::jsonb,
  fanpage_url text not null default 'https://www.facebook.com/',
  facebook_url text not null default 'https://www.facebook.com/',
  updated_at timestamptz not null default now()
);

alter table public.connect_settings add column if not exists fanpage_url text not null default 'https://www.facebook.com/';
alter table public.connect_settings add column if not exists facebook_url text not null default 'https://www.facebook.com/';

insert into public.connect_settings (id) values (1) on conflict (id) do nothing;

grant select on public.connect_settings to anon, authenticated;
grant all on public.connect_settings to service_role;

alter table public.connect_settings enable row level security;

drop policy if exists "connect_settings read" on public.connect_settings;
create policy "connect_settings read" on public.connect_settings for select using (true);

-- Chỉ admin được sửa cấu hình.
drop policy if exists "connect_settings admin write" on public.connect_settings;
create policy "connect_settings admin write" on public.connect_settings
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

grant update on public.connect_settings to authenticated;

-- 2) Danh sách "Giữ chuỗi" — ưu tiên hiển thị lại ở lần quét sau
create table if not exists public.connect_streaks (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);

grant select, insert, update, delete on public.connect_streaks to authenticated;
grant all on public.connect_streaks to service_role;

alter table public.connect_streaks enable row level security;

drop policy if exists "connect_streaks own" on public.connect_streaks;
create policy "connect_streaks own" on public.connect_streaks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
