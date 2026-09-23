-- Supabase #4 — QUẢN LÝ ALBUM (Admin Panel → "Quản Lý Album")
-- Chạy toàn bộ file này trong SQL Editor của project ybzdpxwbpbkeqkqwbscp.
--
-- Bảng `public.albums` + bucket công khai `album-covers` (1 ảnh cover / album).
-- Không đụng tới bảng / bucket / policy nào khác của Supabase #4.
-- Tài khoản thứ hai nằm ở Supabase #1 (profiles) — ở đây chỉ lưu THAM CHIẾU
-- (owner_id / owner_username / owner_name / owner_avatar), không copy bài viết.

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  owner_username text,
  owner_name text,
  owner_avatar text,
  title text not null,
  cover_url text,
  view_count bigint not null default 0,
  photo_count int not null default 0,
  video_count int not null default 0,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists albums_enabled_idx on public.albums(enabled, created_at desc);
create index if not exists albums_owner_idx on public.albums(owner_id);

grant select on public.albums to anon, authenticated;
grant insert, update, delete on public.albums to anon, authenticated;
grant all on public.albums to service_role;

alter table public.albums enable row level security;

drop policy if exists "albums public read" on public.albums;
create policy "albums public read" on public.albums
  for select to anon, authenticated using (true);

drop policy if exists "albums admin insert" on public.albums;
create policy "albums admin insert" on public.albums
  for insert to anon, authenticated with check (true);

drop policy if exists "albums admin update" on public.albums;
create policy "albums admin update" on public.albums
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "albums admin delete" on public.albums;
create policy "albums admin delete" on public.albums
  for delete to anon, authenticated using (true);

-- Bucket công khai cho ảnh cover Album
insert into storage.buckets (id, name, public)
values ('album-covers', 'album-covers', true)
on conflict (id) do nothing;

drop policy if exists "album covers public read" on storage.objects;
create policy "album covers public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'album-covers');

drop policy if exists "album covers insert" on storage.objects;
create policy "album covers insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'album-covers');

drop policy if exists "album covers update" on storage.objects;
create policy "album covers update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'album-covers') with check (bucket_id = 'album-covers');

drop policy if exists "album covers delete" on storage.objects;
create policy "album covers delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'album-covers');
