-- =====================================================================
-- ADMIN TAB — thông báo hệ thống (2026-07-16)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- Thêm các cột cho tab "Admin" trên Home:
--   is_admin_post   BOOLEAN  — bài do Admin đăng
--   admin_priority  TEXT     — 'urgent' | 'important' | 'info'
--   is_popup        BOOLEAN  — hiện popup khi user mở website
-- Cùng RLS: chỉ profiles.is_admin=true mới được INSERT/UPDATE/DELETE
-- bài có is_admin_post=true.
-- =====================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_admin_post  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_priority TEXT    NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS is_popup       BOOLEAN NOT NULL DEFAULT false;

-- Ràng buộc giá trị hợp lệ cho admin_priority.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_admin_priority_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_admin_priority_check
      CHECK (admin_priority IN ('urgent','important','info'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS posts_admin_feed_idx
  ON public.posts (is_admin_post, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_admin_popup_idx
  ON public.posts (is_popup, created_at DESC)
  WHERE is_admin_post = true AND is_popup = true;

-- ============ RLS: chỉ admin mới ghi được bài is_admin_post ============
-- Read: bài admin công khai — ai đọc feed cũng thấy (tuân theo policy đọc hiện có).
-- Write: chỉ profiles.is_admin=true.

DROP POLICY IF EXISTS "Admins can insert admin posts" ON public.posts;
CREATE POLICY "Admins can insert admin posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    -- Cho phép user thường đăng bài NORMAL (is_admin_post=false).
    (is_admin_post = false)
    OR public.is_current_user_admin()
  );

DROP POLICY IF EXISTS "Only admins can flag posts as admin" ON public.posts;
CREATE POLICY "Only admins can flag posts as admin"
  ON public.posts FOR UPDATE TO authenticated
  USING (
    -- Chủ post được sửa bài của mình (nếu không đụng flag admin);
    -- admin được sửa mọi thứ (policy "Admins can update any post" đã có).
    auth.uid() = user_id
    OR public.is_current_user_admin()
  )
  WITH CHECK (
    -- Nếu bài là is_admin_post=true → chỉ admin mới được lưu.
    (is_admin_post = false AND auth.uid() = user_id)
    OR public.is_current_user_admin()
  );
