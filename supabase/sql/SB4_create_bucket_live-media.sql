-- ============================================================
-- SB4 — ybzdpxwbpbkeqkqwbscp
-- Chạy file này TRONG SQL Editor của ĐÚNG project SB4.
-- Tạo 1 bucket mới: live-media (public).
-- KHÔNG đụng tới album-covers, zalo-media, zalo-float-icon,
-- bait-groups, site-branding hay bất kỳ bảng/RPC nào.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'live-media',
  'live-media',
  true,
  5242880, -- 5MB
  array['image/webp','image/png','image/jpeg','image/jpg']
)
on conflict (id) do nothing;

-- ============================================================
-- POLICIES — live-media (public)
-- Đọc: mọi người (trang Live hiển thị cho cả khách chưa đăng nhập).
-- Ghi: chỉ authenticated (Admin quản lý phòng Live).
-- ============================================================

drop policy if exists "live_media_read_public" on storage.objects;
create policy "live_media_read_public"
on storage.objects for select to anon, authenticated
using (bucket_id = 'live-media');

drop policy if exists "live_media_insert_authenticated" on storage.objects;
create policy "live_media_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'live-media');

drop policy if exists "live_media_update_authenticated" on storage.objects;
create policy "live_media_update_authenticated"
on storage.objects for update to authenticated
using (bucket_id = 'live-media')
with check (bucket_id = 'live-media');

drop policy if exists "live_media_delete_authenticated" on storage.objects;
create policy "live_media_delete_authenticated"
on storage.objects for delete to authenticated
using (bucket_id = 'live-media');

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY
-- select id, public, file_size_limit from storage.buckets where id = 'live-media';
-- ============================================================
