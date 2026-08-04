-- 1) Posts: cờ đã chỉnh sửa
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- 2) Bảng tố cáo bài viết
CREATE TABLE IF NOT EXISTS public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

GRANT SELECT, INSERT ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_insert_self" ON public.post_reports;
CREATE POLICY "report_insert_self" ON public.post_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "report_view_own" ON public.post_reports;
CREATE POLICY "report_view_own" ON public.post_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- 3) Video views (theo dõi lượt xem video)
CREATE TABLE IF NOT EXISTS public.video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS video_views_video_idx ON public.video_views(video_id);
GRANT SELECT, INSERT ON public.video_views TO authenticated, anon;
GRANT ALL ON public.video_views TO service_role;

ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_views_select_all" ON public.video_views;
CREATE POLICY "video_views_select_all" ON public.video_views FOR SELECT USING (true);
DROP POLICY IF EXISTS "video_views_insert_any" ON public.video_views;
CREATE POLICY "video_views_insert_any" ON public.video_views FOR INSERT WITH CHECK (true);

-- 4) Gỡ vĩnh viễn thông báo "thả tim" (like_post / like_video)
DELETE FROM public.notifications WHERE type IN ('like_post', 'like_video');

-- Nếu có trigger sinh notification cho like, xoá để không phát sinh thêm
DROP TRIGGER IF EXISTS trg_notify_on_like ON public.likes;
DROP TRIGGER IF EXISTS trg_like_notification ON public.likes;
DROP TRIGGER IF EXISTS trg_notify_on_video_like ON public.video_likes;
DROP TRIGGER IF EXISTS trg_video_like_notification ON public.video_likes;
