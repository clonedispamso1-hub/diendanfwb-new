-- ============================================================
-- Kết nối v2 — Lượt quét theo tuần + Khu vực lưu vào hồ sơ + Zalo VIP theo khu vực
-- Chạy 1 lần trong SQL Editor của Supabase. Idempotent.
-- ============================================================

-- 1) Cấu hình
alter table public.connect_settings add column if not exists weekly_scan_limit integer not null default 30;
-- 0 = Chủ nhật, 1 = Thứ 2 ... 6 = Thứ 7
alter table public.connect_settings add column if not exists reset_weekday integer not null default 1;
alter table public.connect_settings add column if not exists zalo_links jsonb not null default '{}'::jsonb;

-- 2) Khu vực đã đăng ký (chỉ hỏi 1 lần, sau đó chỉ đổi trong Chỉnh sửa hồ sơ)
alter table public.profiles add column if not exists connect_province text;
alter table public.profiles add column if not exists connect_district text;

-- 3) Lượt quét theo tuần
create table if not exists public.connect_scan_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

grant select, insert, update on public.connect_scan_usage to authenticated;
grant all on public.connect_scan_usage to service_role;

alter table public.connect_scan_usage enable row level security;

drop policy if exists "scan usage own" on public.connect_scan_usage;
create policy "scan usage own" on public.connect_scan_usage
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
