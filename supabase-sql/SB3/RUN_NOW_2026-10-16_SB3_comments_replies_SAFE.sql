-- ============================================================
-- CHẠY TRÊN: Supabase #3 (content/feed) — project uaqsetfdciyzxpuhulux
-- MỤC ĐÍCH : Bảo đảm bảng `comments` CÓ SẴN đủ cột/chỉ mục/quyền cho
--            chức năng Bình luận + Trả lời. KHÔNG tạo bảng mới, KHÔNG xoá dữ liệu.
-- An toàn chạy nhiều lần (idempotent).
-- ============================================================

-- 0) Kiểm tra trước (chỉ đọc):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='comments' ORDER BY ordinal_position;
-- SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='comments';

-- 1) Cột cần dùng (chỉ thêm nếu thiếu)
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 2) Chỉ mục
CREATE INDEX IF NOT EXISTS comments_post_idx   ON public.comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON public.comments (parent_id);

-- 3) Quyền (giống cơ chế anon_bridge đang dùng cho posts/likes trên #3)
GRANT SELECT, INSERT, UPDATE ON public.comments TO anon, authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments'
                 AND policyname IN ('comments_anon_bridge')) THEN
    CREATE POLICY comments_anon_bridge ON public.comments
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
