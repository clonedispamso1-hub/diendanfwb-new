-- =============================================================================
-- RUN_NOW 2026-08-30 — TẠO CÁC BẢNG CÒN THIẾU TRÊN SUPABASE #1 (SB1 / core)
-- =============================================================================
-- Vì sao cần file này?
--   Web đang gọi liên tục 3 nhóm API trả về 404 (bảng chưa tồn tại):
--     • user_blocks   (chặn người dùng)
--     • stories / story_views (tin 24h)
--     • videos_social + video_likes / video_comments / video_views (video ngắn)
--   App đã được vá để TỰ DỪNG gọi các bảng thiếu (src/lib/db/missing-tables.ts),
--   nên hiện tại không còn request 404 nào nữa.
--
-- Muốn BẬT LẠI các tính năng trên:
--   1. Mở Supabase #1 (gxfxqbhxoghdhokwjpex) → SQL Editor → dán & chạy file này.
--   2. Quay lại web, mở Console và gõ: __dbResetMissingTables()  (hoặc mở tab mới).
-- =============================================================================

-- ---------------------------------------------------------------- user_blocks
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  target_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, target_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON public.user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_target_idx  ON public.user_blocks (target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id OR auth.uid() = target_id);

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- -------------------------------------------------------- stories / story_views
CREATE TABLE IF NOT EXISTS public.stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  media_url  text NOT NULL,
  public_id  text,
  media_type text NOT NULL DEFAULT 'image',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS stories_user_expires_idx ON public.stories (user_id, expires_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stories_select_all ON public.stories;
CREATE POLICY stories_select_all ON public.stories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS stories_write_own ON public.stories;
CREATE POLICY stories_write_own ON public.stories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS stories_delete_own ON public.stories;
CREATE POLICY stories_delete_own ON public.stories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.story_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, viewer_id)
);
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_views_select ON public.story_views;
CREATE POLICY story_views_select ON public.story_views
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS story_views_insert_own ON public.story_views;
CREATE POLICY story_views_insert_own ON public.story_views
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);

-- --------------------------------------------------------------- videos_social
CREATE TABLE IF NOT EXISTS public.videos_social (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  video_url  text NOT NULL,
  caption    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS videos_social_created_idx ON public.videos_social (created_at DESC);
CREATE INDEX IF NOT EXISTS videos_social_user_idx    ON public.videos_social (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos_social TO authenticated;
GRANT ALL ON public.videos_social TO service_role;
ALTER TABLE public.videos_social ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS videos_social_select_all ON public.videos_social;
CREATE POLICY videos_social_select_all ON public.videos_social
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS videos_social_write_own ON public.videos_social;
CREATE POLICY videos_social_write_own ON public.videos_social
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS videos_social_delete_own ON public.videos_social;
CREATE POLICY videos_social_delete_own ON public.videos_social
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------- tương tác video (like / comment / view)
CREATE TABLE IF NOT EXISTS public.video_likes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   uuid NOT NULL REFERENCES public.videos_social(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.video_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   uuid NOT NULL REFERENCES public.videos_social(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.video_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   uuid NOT NULL REFERENCES public.videos_social(id) ON DELETE CASCADE,
  viewer_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.video_likes    TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.video_comments TO authenticated;
GRANT SELECT, INSERT          ON public.video_views   TO authenticated;
GRANT ALL ON public.video_likes, public.video_comments, public.video_views TO service_role;

ALTER TABLE public.video_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_views    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_likes_rw ON public.video_likes;
CREATE POLICY video_likes_rw ON public.video_likes
  FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS video_comments_select ON public.video_comments;
CREATE POLICY video_comments_select ON public.video_comments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS video_comments_write_own ON public.video_comments;
CREATE POLICY video_comments_write_own ON public.video_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS video_comments_delete_own ON public.video_comments;
CREATE POLICY video_comments_delete_own ON public.video_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS video_views_select ON public.video_views;
CREATE POLICY video_views_select ON public.video_views
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS video_views_insert_own ON public.video_views;
CREATE POLICY video_views_insert_own ON public.video_views
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);
