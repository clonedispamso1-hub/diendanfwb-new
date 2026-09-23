-- =====================================================================
-- SUPABASE #4 — public.nearby_pool (Tìm Quanh Đây)
-- BẢN HOÀN CHỈNH, SIẾT QUYỀN: chỉ luồng quản trị (service_role, gọi từ
-- server) được GHI; user thường (anon/authenticated) CHỈ ĐỌC hồ sơ đang bật.
--
-- Chạy MỘT LẦN toàn bộ file này trong SQL Editor của project
-- ybzdpxwbpbkeqkqwbscp. Idempotent — chạy lại nhiều lần vẫn an toàn.
-- File này THAY THẾ supabase-sql/SB4/2026-09-16_nearby_pool.sql.
-- =====================================================================

-- 1) Bảng (tạo nếu chưa có) ------------------------------------------------
create table if not exists public.nearby_pool (
  -- source_id = profiles.id trên Supabase #1 (khoá chính để upsert idempotent)
  source_id    uuid primary key,
  username     text,
  display_name text,
  avatar       text,
  gender       text not null default 'female',
  age          integer,
  province     text,
  district     text,
  bio          text,
  looking_for  text,
  distance_km  numeric(6, 2),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.nearby_pool add column if not exists district text;
alter table public.nearby_pool add column if not exists bio text;
alter table public.nearby_pool add column if not exists looking_for text;
alter table public.nearby_pool add column if not exists distance_km numeric(6, 2);

create index if not exists nearby_pool_active_idx
  on public.nearby_pool (province)
  where is_active = true;

-- 2) Quyền: thu hồi mọi quyền ghi của anon/authenticated -------------------
revoke all on public.nearby_pool from anon;
revoke all on public.nearby_pool from authenticated;

-- Chỉ cấp ĐỌC những cột cần cho giao diện Tìm Quanh Đây (không lộ cột khác).
grant select (
  source_id, username, display_name, avatar, gender, age,
  province, district, bio, looking_for, distance_km, is_active
) on public.nearby_pool to anon, authenticated;

-- Toàn quyền cho service_role (server function của Admin Panel).
grant all on public.nearby_pool to service_role;

-- 3) RLS -------------------------------------------------------------------
alter table public.nearby_pool enable row level security;
-- Bảo đảm chủ bảng cũng phải tuân RLS (không có đường lách qua owner).
alter table public.nearby_pool force row level security;

-- Xoá toàn bộ policy cũ (bản trước cho phép anon ghi tự do).
drop policy if exists "nearby pool read"   on public.nearby_pool;
drop policy if exists "nearby pool insert" on public.nearby_pool;
drop policy if exists "nearby pool update" on public.nearby_pool;
drop policy if exists "nearby pool delete" on public.nearby_pool;
drop policy if exists "nearby pool admin write" on public.nearby_pool;

-- User thường: chỉ đọc hồ sơ đang bật (và chỉ hồ sơ Nữ — đúng nghiệp vụ).
create policy "nearby pool read active"
  on public.nearby_pool
  for select
  to anon, authenticated
  using (is_active = true and gender = 'female');

-- Luồng quản trị: service_role bỏ qua RLS, nhưng khai báo tường minh
-- để ý định rõ ràng và tránh bị siết sai về sau.
create policy "nearby pool service write"
  on public.nearby_pool
  for all
  to service_role
  using (true)
  with check (true);

-- 4) Giữ updated_at luôn đúng ---------------------------------------------
create or replace function public.nearby_pool_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nearby_pool_touch_trg on public.nearby_pool;
create trigger nearby_pool_touch_trg
  before update on public.nearby_pool
  for each row execute function public.nearby_pool_touch();

-- =====================================================================
-- KIỂM TRA NHANH (chạy sau khi apply):
--   -- phải KHÔNG còn quyền ghi cho anon/authenticated:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'nearby_pool';
--   -- phải chỉ còn 2 policy: read active + service write
--   select policyname, cmd, roles from pg_policies
--    where tablename = 'nearby_pool';
-- =====================================================================
