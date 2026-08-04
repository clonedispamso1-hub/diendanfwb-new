-- =====================================================================
-- ⚡ CHẠY FILE NÀY MỘT LẦN TRONG SUPABASE SQL EDITOR
-- Task #5.1 — Fix "new row violates row-level security policy" khi upload avatar
--
-- Storage bucket: public.avatars
-- Convention path: "<auth.uid()>/<filename>"  (xem premium-onboarding.tsx)
--
-- Policies:
--   • SELECT — public (avatars hiển thị công khai)
--   • INSERT — authenticated, chỉ ghi vào thư mục UID của chính mình
--   • UPDATE — authenticated, chỉ sửa object của chính mình
--   • DELETE — authenticated, chỉ xóa object của chính mình
--
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- KHÔNG đụng dữ liệu cũ. KHÔNG đổi schema các bảng khác.
-- =====================================================================

-- 1) Bucket phải tồn tại và public
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Drop các policy cũ (theo tên của mình) để re-run sạch sẽ
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'avatars_public_read',
        'avatars_authenticated_insert_own',
        'avatars_authenticated_update_own',
        'avatars_authenticated_delete_own'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- 3) Public read
CREATE POLICY "avatars_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- 4) INSERT — chỉ vào thư mục UID của mình
CREATE POLICY "avatars_authenticated_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) UPDATE — chỉ object của mình
CREATE POLICY "avatars_authenticated_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      owner = auth.uid()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6) DELETE — chỉ object của mình
CREATE POLICY "avatars_authenticated_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      owner = auth.uid()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
