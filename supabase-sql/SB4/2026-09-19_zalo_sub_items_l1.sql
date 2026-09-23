-- Admin Panel > Nhóm Zalo Mồi — MỤC CON LỚP 1 của 3 card quốc gia
-- + KHO ẢNH ZALO / LINE dùng chung.
-- Idempotent: chạy lại nhiều lần không mất dữ liệu.

/* ------------------------- 1) Mục con lớp 1 ------------------------- */

create table if not exists public.zalo_sub_items_l1 (
  id          uuid primary key default gen_random_uuid(),
  country_id  text not null,                 -- 'vn' | 'tw' | 'jp'
  name        text not null,
  subtitle    text not null default '',
  image_url   text,
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists zalo_sub_items_l1_country_name_idx
  on public.zalo_sub_items_l1 (country_id, name);
create index if not exists zalo_sub_items_l1_country_idx
  on public.zalo_sub_items_l1 (country_id, sort_order);

grant select, insert, update, delete on public.zalo_sub_items_l1 to anon;
grant select, insert, update, delete on public.zalo_sub_items_l1 to authenticated;
grant all on public.zalo_sub_items_l1 to service_role;

alter table public.zalo_sub_items_l1 enable row level security;

drop policy if exists "zalo_sub_items_l1 read" on public.zalo_sub_items_l1;
create policy "zalo_sub_items_l1 read" on public.zalo_sub_items_l1
  for select to anon, authenticated using (true);

drop policy if exists "zalo_sub_items_l1 insert" on public.zalo_sub_items_l1;
create policy "zalo_sub_items_l1 insert" on public.zalo_sub_items_l1
  for insert to anon, authenticated with check (country_id in ('vn','tw','jp'));

drop policy if exists "zalo_sub_items_l1 update" on public.zalo_sub_items_l1;
create policy "zalo_sub_items_l1 update" on public.zalo_sub_items_l1
  for update to anon, authenticated
  using (country_id in ('vn','tw','jp')) with check (country_id in ('vn','tw','jp'));

drop policy if exists "zalo_sub_items_l1 delete" on public.zalo_sub_items_l1;
create policy "zalo_sub_items_l1 delete" on public.zalo_sub_items_l1
  for delete to anon, authenticated using (country_id in ('vn','tw','jp'));

/* ---------------------- 2) Kho ảnh Zalo / LINE ---------------------- */

create table if not exists public.zalo_media_library (
  id         uuid primary key default gen_random_uuid(),
  url        text not null unique,
  label      text not null default '',
  kind       text not null default 'zalo',   -- 'zalo' | 'line'
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.zalo_media_library to anon;
grant select, insert, update, delete on public.zalo_media_library to authenticated;
grant all on public.zalo_media_library to service_role;

alter table public.zalo_media_library enable row level security;

drop policy if exists "zalo_media_library read" on public.zalo_media_library;
create policy "zalo_media_library read" on public.zalo_media_library
  for select to anon, authenticated using (true);

drop policy if exists "zalo_media_library insert" on public.zalo_media_library;
create policy "zalo_media_library insert" on public.zalo_media_library
  for insert to anon, authenticated with check (true);

drop policy if exists "zalo_media_library update" on public.zalo_media_library;
create policy "zalo_media_library update" on public.zalo_media_library
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "zalo_media_library delete" on public.zalo_media_library;
create policy "zalo_media_library delete" on public.zalo_media_library
  for delete to anon, authenticated using (true);

/* --------------------- 3) Bucket ảnh công khai ---------------------- */

insert into storage.buckets (id, name, public)
values ('zalo-media', 'zalo-media', true)
on conflict (id) do update set public = true;

drop policy if exists "zalo-media read" on storage.objects;
create policy "zalo-media read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'zalo-media');

drop policy if exists "zalo-media insert" on storage.objects;
create policy "zalo-media insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'zalo-media');

drop policy if exists "zalo-media update" on storage.objects;
create policy "zalo-media update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'zalo-media') with check (bucket_id = 'zalo-media');

drop policy if exists "zalo-media delete" on storage.objects;
create policy "zalo-media delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'zalo-media');

/* ------------------------ 4) Dữ liệu mặc định ----------------------- */

insert into public.zalo_sub_items_l1 (country_id, name, subtitle, sort_order) values
  ('vn', 'VIP ZALO {LOCATION}', '', 1),
  ('vn', 'VIP ZALO MIỄN PHÍ', '', 2),
  ('tw', 'VIP ZALO CHO DU HỌC SINH TAIWAN', '', 1),
  ('tw', 'VIP ZALO CHƠI LỄ TAIWAN', '', 2),
  ('tw', 'VIP LINE ĂN CHƠI TAIWAN', '', 3),
  ('tw', 'LINE VIP TAIWAN 🔞', '', 4),
  ('tw', 'LINE VIP TAIWAN LIVE 🔞', '', 5),
  ('jp', 'VIP ZALO KẾT DUYÊN NHẬT BẢN', '', 1),
  ('jp', 'VIP LINE MIỄN PHÍ NHẬT BẢN', '', 2),
  ('jp', 'VIP ZALO CHO DU HỌC SINH NHẬT BẢN', '', 3),
  ('jp', 'VIP ZALO CHƠI LỄ NHẬT BẢN', '', 4),
  ('jp', 'LINE VIP NHẬT BẢN KẾT NỐI', '', 5)
on conflict (country_id, name) do nothing;
