-- Supabase #4 — Pool hồ sơ cho tính năng "Tìm Quanh Đây".
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
-- Idempotent — chạy lại nhiều lần đều an toàn.
--
-- Nguồn dữ liệu: "Tài khoản thứ hai" (clone) trên Supabase #1, CHỈ giới tính Nữ.
-- Bảng này chỉ MIRROR các hồ sơ đã có (không tạo clone mới) để tính năng
-- Tìm Quanh Đây có pool riêng, không đụng Supabase #1/#2/#3.

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

grant select on public.nearby_pool to anon, authenticated;
grant insert, update, delete on public.nearby_pool to anon, authenticated;
grant all on public.nearby_pool to service_role;

alter table public.nearby_pool enable row level security;

drop policy if exists "nearby pool read" on public.nearby_pool;
create policy "nearby pool read" on public.nearby_pool
  for select to anon, authenticated using (true);

drop policy if exists "nearby pool insert" on public.nearby_pool;
create policy "nearby pool insert" on public.nearby_pool
  for insert to anon, authenticated with check (true);

drop policy if exists "nearby pool update" on public.nearby_pool;
create policy "nearby pool update" on public.nearby_pool
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "nearby pool delete" on public.nearby_pool;
create policy "nearby pool delete" on public.nearby_pool
  for delete to anon, authenticated using (true);
