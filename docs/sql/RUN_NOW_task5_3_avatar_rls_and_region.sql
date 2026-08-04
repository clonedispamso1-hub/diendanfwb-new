-- ============================================================
-- Task #5.3 — Avatar Storage RLS + Profile Region backfill
-- CHẠY 1 LẦN trong Supabase SQL Editor (project hiện tại).
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- KHÔNG đổi Supabase URL, KHÔNG đổi Publishable Key, KHÔNG tạo project mới.
-- ============================================================

-- 1) Bucket "avatars" phải tồn tại và public để hiển thị công khai
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Dọn policy cũ (theo tên chuẩn) để re-run sạch
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

-- 3) SELECT — public đọc avatar
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- 4) INSERT — user vừa đăng ký ĐƯỢC upload vào thư mục UID của chính họ
--    Convention path: "<auth.uid()>/<filename>" (xem premium-onboarding.tsx)
CREATE POLICY "avatars_authenticated_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) UPDATE — chỉ object của chính mình
CREATE POLICY "avatars_authenticated_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6) DELETE — chỉ object của chính mình
CREATE POLICY "avatars_authenticated_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ============================================================
-- 7) Đảm bảo cột `region` tồn tại + backfill từ province/location
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region TEXT;

-- Backfill 3 cột region/province/location đồng bộ nhau (legacy code đọc bất kỳ cột nào).
UPDATE public.profiles
   SET region = COALESCE(NULLIF(region, ''), NULLIF(province, ''), NULLIF(location, ''))
 WHERE region IS NULL OR region = '';

UPDATE public.profiles
   SET province = COALESCE(NULLIF(province, ''), NULLIF(region, ''), NULLIF(location, ''))
 WHERE province IS NULL OR province = '';

UPDATE public.profiles
   SET location = COALESCE(NULLIF(location, ''), NULLIF(region, ''), NULLIF(province, ''))
 WHERE location IS NULL OR location = '';
