-- =====================================================================
-- ⚡ CHẠY TRÊN SUPABASE #2 (MEDIA) — project pymwwuscoftmdcmmeckp
--    KHÔNG chạy trên Supabase #1 (core) và KHÔNG chạy trên #3 (logs).
--
-- MỤC ĐÍCH
--   Media của CLONE (bài viết clone, comment clone, chat clone, story,
--   avatar/cover clone, gif, sticker, audio) lưu vào Storage của
--   Supabase #2 — KHÔNG dùng Cloudinary.
--   Code frontend đã trỏ đúng: src/lib/media/providers/supabase-media.ts
--   (bucket `media`, subfolder theo loại) → file này chỉ tạo bucket + policy.
--
-- NỐI TIẾP: docs/sql/MEDIA2_RUN_NOW_media_bucket_policies.sql
--   (file cũ chỉ tạo policy, không tạo bucket). File này idempotent,
--   chạy lại nhiều lần vẫn an toàn.
--
-- CAM KẾT AN TOÀN
--   • KHÔNG xoá dữ liệu (không DELETE / TRUNCATE / DROP TABLE).
--   • KHÔNG tạo bảng mới, KHÔNG tạo trigger, KHÔNG tạo function.
--   • KHÔNG cấp quyền liệt kê toàn bộ bucket (không policy nào trên
--     storage.buckets cho anon/authenticated → không thể list bucket khác).
--
-- CÁCH CHẠY: bôi đen TỪNG BƯỚC rồi Run, để thấy lỗi ở đúng bước.
-- =====================================================================


-- ---------- BƯỚC 1: tạo bucket `media` (chỉ khi chưa có) ----------
-- Public read để website hiển thị ảnh bằng Public URL.
-- Nếu bước này báo lỗi permission (SQL Editor không cho ghi storage.buckets),
-- BỎ QUA bước 1 và tạo thủ công: Storage → New bucket → name = media,
-- bật "Public bucket", File size limit = 100MB. Rồi chạy tiếp từ BƯỚC 2.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)
on conflict (id) do nothing;


-- ---------- BƯỚC 2: dọn policy cũ trùng tên (không xoá file) ----------
drop policy if exists "media_public_read"   on storage.objects;
drop policy if exists "media_client_insert" on storage.objects;
drop policy if exists "media_owner_update"  on storage.objects;
drop policy if exists "media_owner_delete"  on storage.objects;


-- ---------- BƯỚC 3: ĐỌC — chỉ trong bucket `media` ----------
create policy "media_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'media');


-- ---------- BƯỚC 4: UPLOAD — anon + authenticated, đúng subfolder ----------
-- Frontend nối #2 bằng anon key và KHÔNG đăng nhập (Auth ở #1) → role `anon`.
-- Chỉ cho ghi vào đúng 9 subfolder mà media-service đang dùng.
create policy "media_client_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (
      'avatars','posts','comments','chat','stories','gifs','stickers','audio','covers'
    )
  );


-- ---------- BƯỚC 5: UPDATE / DELETE — chỉ chủ sở hữu đã đăng nhập ----------
create policy "media_owner_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media' and owner = auth.uid())
  with check (bucket_id = 'media' and owner = auth.uid());

create policy "media_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media' and owner = auth.uid());


-- ---------- BƯỚC 6: CHẶN LIỆT KÊ TOÀN BỘ BUCKET ----------
-- Chỉ bật RLS trên storage.buckets và KHÔNG tạo policy nào cho anon /
-- authenticated → GET /storage/v1/bucket trả về danh sách rỗng.
-- (Upload/đọc theo đường dẫn bucket `media` vẫn hoạt động bình thường.)
alter table storage.buckets enable row level security;

drop policy if exists "buckets_public_list"     on storage.buckets;
drop policy if exists "Public bucket list"      on storage.buckets;
drop policy if exists "Allow bucket listing"    on storage.buckets;
drop policy if exists "buckets_select_all"      on storage.buckets;


-- ---------- BƯỚC 7: KIỂM TRA ----------
-- 7a) Bucket `media` phải tồn tại và public = true
select id, name, public, file_size_limit
from storage.buckets
where id = 'media';

-- 7b) Phải thấy đúng 4 policy; media_client_insert có {anon,authenticated}
select policyname, roles, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'media_%'
order by policyname;

-- 7c) Phải trả về 0 dòng (không ai được list bucket)
select policyname, roles, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'buckets';
