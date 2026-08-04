-- ============================================================
-- SUPABASE #2 — Nâng cấp bảng live_moc_rooms cho giao diện Live mới
-- Chạy trên SQL Editor của Supabase #2 (VITE_MEDIA_SUPABASE_URL).
-- An toàn, chạy lại nhiều lần được.
-- ============================================================

alter table public.live_moc_rooms
  add column if not exists started_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists likes integer not null default 0,
  add column if not exists comments integer not null default 0,
  add column if not exists is_hot boolean not null default false;

-- ============================================================
-- Storage: bucket ảnh thumbnail phòng Live (Supabase #2)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('live-thumbnails', 'live-thumbnails', true)
on conflict (id) do update set public = true;

drop policy if exists "live_thumbnails_read" on storage.objects;
create policy "live_thumbnails_read" on storage.objects
  for select using (bucket_id = 'live-thumbnails');

drop policy if exists "live_thumbnails_write" on storage.objects;
create policy "live_thumbnails_write" on storage.objects
  for insert with check (bucket_id = 'live-thumbnails');

drop policy if exists "live_thumbnails_update" on storage.objects;
create policy "live_thumbnails_update" on storage.objects
  for update using (bucket_id = 'live-thumbnails') with check (bucket_id = 'live-thumbnails');

drop policy if exists "live_thumbnails_delete" on storage.objects;
create policy "live_thumbnails_delete" on storage.objects
  for delete using (bucket_id = 'live-thumbnails');
