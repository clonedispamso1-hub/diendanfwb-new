-- =====================================================================
-- ⚡ CHẠY TRÊN SUPABASE #2 (MEDIA) — SQL Editor. KHÔNG chạy trên #1.
--
-- Đã xác minh bằng request thật (curl) tới project #2:
--   POST /storage/v1/object/media/avatars/... với anon key
--   → 403 "new row violates row-level security policy"
-- => Policy INSERT cho role `anon` CHƯA có hiệu lực.
--
-- Nguyên nhân thường gặp: file SQL trước có ghi vào `storage.buckets`
-- (insert/update). Trong SQL Editor cả script chạy trong MỘT transaction,
-- nếu dòng đó bị từ chối quyền thì TOÀN BỘ script rollback — nhìn thì
-- tưởng "chạy thành công" nhưng policy không được tạo.
--
-- File này KHÔNG đụng vào storage.buckets (bucket bạn đã tạo sẵn ở UI).
-- CHẠY TỪNG BƯỚC (bôi đen từng khối rồi Run) để thấy lỗi nếu có.
-- =====================================================================

-- ---------- BƯỚC 1: dọn policy cũ ----------
drop policy if exists "media_public_read"   on storage.objects;
drop policy if exists "media_client_insert" on storage.objects;
drop policy if exists "media_owner_update"  on storage.objects;
drop policy if exists "media_owner_delete"  on storage.objects;

-- ---------- BƯỚC 2: ĐỌC public ----------
create policy "media_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'media');

-- ---------- BƯỚC 3: UPLOAD (anon + authenticated) ----------
-- Frontend kết nối #2 bằng anon key và KHÔNG đăng nhập (Auth nằm ở #1),
-- nên request chạy dưới role `anon`. Bắt buộc phải cấp cho `anon`.
create policy "media_client_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (
      'avatars','posts','comments','chat','stories','gifs','stickers','audio','covers'
    )
  );

-- ---------- BƯỚC 4: UPDATE / DELETE cho chủ sở hữu (tuỳ chọn) ----------
create policy "media_owner_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media' and owner = auth.uid())
  with check (bucket_id = 'media' and owner = auth.uid());

create policy "media_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media' and owner = auth.uid());

-- ---------- BƯỚC 5: KIỂM TRA (phải thấy 4 dòng, media_client_insert có {anon,authenticated}) ----------
select policyname, roles, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'media_%'
order by policyname;

-- ---------- BƯỚC 6 (chỉ khi vẫn lỗi): bucket phải là Public ----------
-- Vào Storage → bucket `media` → Settings → bật "Public bucket".
-- Đừng chạy INSERT/UPDATE trên storage.buckets bằng SQL.
