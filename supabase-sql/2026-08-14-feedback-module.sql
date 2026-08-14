-- =====================================================================
-- MODULE FEEDBACK (BLOG) — SQL IDEMPOTENT (chạy lại nhiều lần vẫn OK).
-- Chạy trên Supabase #1 (DB chính) bằng SQL Editor.
-- KHÔNG đụng: profiles, posts (feed), messages (chat), wallet, notifications.
-- Giữ nguyên dữ liệu cũ: chỉ ADD COLUMN IF NOT EXISTS, không DROP TABLE.
-- =====================================================================

-- 1) Tạo bảng ở dạng tối thiểu nếu chưa có (schema đầy đủ thêm ở bước 2).
CREATE TABLE IF NOT EXISTS public.feedback_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 2) Bổ sung TẤT CẢ cột còn thiếu (fix ERROR 42703 column "is_hidden" does not exist).
ALTER TABLE public.feedback_posts
  ADD COLUMN IF NOT EXISTS title        text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS author_name  text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS area         text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt      text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content      text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url    text,
  ADD COLUMN IF NOT EXISTS thumb_url    text,
  ADD COLUMN IF NOT EXISTS like_base    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_target  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_start   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS like_seconds integer     NOT NULL DEFAULT 172800,
  ADD COLUMN IF NOT EXISTS view_base    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_target  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_start   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS view_seconds integer     NOT NULL DEFAULT 172800,
  ADD COLUMN IF NOT EXISTS rating       numeric(2,1) NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS is_hidden    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();

-- 3) Index (chạy sau khi cột chắc chắn đã tồn tại).
CREATE INDEX IF NOT EXISTS feedback_posts_published_idx
  ON public.feedback_posts (is_hidden, published_at DESC);

-- 4) Quyền Data API.
GRANT SELECT ON public.feedback_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_posts TO authenticated;
GRANT ALL ON public.feedback_posts TO service_role;

-- 5) RLS.
ALTER TABLE public.feedback_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_public_read ON public.feedback_posts;
CREATE POLICY feedback_public_read ON public.feedback_posts
  FOR SELECT TO anon, authenticated
  USING (is_hidden = false);

DROP POLICY IF EXISTS feedback_admin_read ON public.feedback_posts;
CREATE POLICY feedback_admin_read ON public.feedback_posts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)));

DROP POLICY IF EXISTS feedback_admin_write ON public.feedback_posts;
CREATE POLICY feedback_admin_write ON public.feedback_posts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)));

-- (Tuỳ chọn) Nếu muốn XOÁ HẲN dữ liệu cũ và tạo lại từ đầu, chạy 2 dòng dưới
-- rồi chạy lại toàn bộ file này:
-- DROP TABLE IF EXISTS public.feedback_posts CASCADE;
