-- =====================================================================
-- ADMIN POST CONTROLS v4 FINAL (2026-06-14)
-- Chạy thủ công trong Supabase SQL Editor. Idempotent, an toàn re-run.
-- KHÔNG xóa cột / dữ liệu cũ.
-- Mục tiêu:
--   * PIN  : admin_pin_post(p_post_id uuid, p_hours int)          [0 = bỏ ghim]
--   * BUMP : admin_bump_post(p_post_id uuid)                       [chỉ update timestamp]
--   * FEATURED: admin_feature_post(p_post_id, p_hours int default 24)
--   * COMMENTS: admin_set_comments_disabled(p_post_id, p_disabled bool)
--   * LOCK : admin_lock_post(p_post_id, p_lock bool, p_reason text)
--   * Khóa bài → cấm tạo like / comment / gift (trigger DB)
-- =====================================================================

-- 0) Helper -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 1) Cột trên public.posts -------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_until      timestamptz,
  ADD COLUMN IF NOT EXISTS is_featured       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until    timestamptz,
  ADD COLUMN IF NOT EXISTS bumped_at         timestamptz,
  ADD COLUMN IF NOT EXISTS comments_disabled boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at         timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason     text;

-- 2) Indexes (IMMUTABLE-safe: không gọi now() trong index) -----------
CREATE INDEX IF NOT EXISTS posts_pinned_until_idx
  ON public.posts (pinned_until DESC NULLS LAST) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS posts_featured_until_idx
  ON public.posts (featured_until DESC NULLS LAST) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS posts_bumped_at_idx
  ON public.posts (bumped_at DESC NULLS LAST) WHERE bumped_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_created_at_desc_idx
  ON public.posts (created_at DESC);

-- 3) Drop signature cũ để tránh collision -----------------------------
DROP FUNCTION IF EXISTS public.admin_pin_post(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_pin_post(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_set_priority(uuid, int);
DROP FUNCTION IF EXISTS public.admin_set_priority(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_set_priority(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_feature_post(uuid, integer);

-- 4) RLS overrides cho admin ----------------------------------------
DROP POLICY IF EXISTS "Admins can update any post" ON public.posts;
CREATE POLICY "Admins can update any post"
  ON public.posts FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete any post" ON public.posts;
CREATE POLICY "Admins can delete any post"
  ON public.posts FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

-- 5) RPC =============================================================

-- A) PIN với số giờ tuỳ chọn (0 = bỏ ghim)
CREATE OR REPLACE FUNCTION public.admin_pin_post(p_post_id uuid, p_hours integer)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hours IS NULL OR p_hours <= 0 THEN
    UPDATE public.posts SET is_pinned = false, pinned_until = NULL
      WHERE id = p_post_id RETURNING * INTO r;
  ELSE
    UPDATE public.posts
       SET is_pinned    = true,
           pinned_until = now() + make_interval(hours => p_hours)
     WHERE id = p_post_id RETURNING * INTO r;
  END IF;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_pin_post(uuid, integer) TO authenticated;

-- B) BUMP — chỉ refresh thời gian
CREATE OR REPLACE FUNCTION public.admin_bump_post(p_post_id uuid)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts SET bumped_at = now() WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_bump_post(uuid) TO authenticated;

-- C) FEATURED (Ưu tiên) — mặc định 24h, 0 = bỏ ưu tiên
CREATE OR REPLACE FUNCTION public.admin_feature_post(p_post_id uuid, p_hours integer DEFAULT 24)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hours IS NULL OR p_hours <= 0 THEN
    UPDATE public.posts SET is_featured = false, featured_until = NULL
      WHERE id = p_post_id RETURNING * INTO r;
  ELSE
    UPDATE public.posts
       SET is_featured    = true,
           featured_until = now() + make_interval(hours => p_hours)
     WHERE id = p_post_id RETURNING * INTO r;
  END IF;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_feature_post(uuid, integer) TO authenticated;

-- D) Tắt / bật bình luận
CREATE OR REPLACE FUNCTION public.admin_set_comments_disabled(p_post_id uuid, p_disabled boolean)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts SET comments_disabled = p_disabled
    WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_set_comments_disabled(uuid, boolean) TO authenticated;

-- E) Khóa / mở khóa bài
CREATE OR REPLACE FUNCTION public.admin_lock_post(p_post_id uuid, p_lock boolean DEFAULT true, p_reason text DEFAULT NULL)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts
     SET is_locked     = p_lock,
         locked_at     = CASE WHEN p_lock THEN now() ELSE NULL END,
         locked_reason = CASE WHEN p_lock THEN p_reason ELSE NULL END
   WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_lock_post(uuid, boolean, text) TO authenticated;

-- 6) Triggers chặn tương tác khi bài bị khóa / tắt BL ----------------
CREATE OR REPLACE FUNCTION public.comments_block_when_locked()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_locked boolean; v_disabled boolean;
BEGIN
  SELECT is_locked, comments_disabled INTO v_locked, v_disabled
    FROM public.posts WHERE id = NEW.post_id;
  IF v_locked THEN
    RAISE EXCEPTION 'Bài viết đã bị quản trị viên khóa.' USING ERRCODE = 'P0001';
  END IF;
  IF v_disabled THEN
    RAISE EXCEPTION 'Bình luận đã bị tắt bởi quản trị viên.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_comments_block_when_locked ON public.comments;
CREATE TRIGGER trg_comments_block_when_locked
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_block_when_locked();

CREATE OR REPLACE FUNCTION public.likes_block_when_locked()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_locked boolean;
BEGIN
  SELECT is_locked INTO v_locked FROM public.posts WHERE id = NEW.post_id;
  IF v_locked THEN
    RAISE EXCEPTION 'Bài viết đã bị khóa, không thể thả tim.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_likes_block_when_locked ON public.likes;
CREATE TRIGGER trg_likes_block_when_locked
  BEFORE INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.likes_block_when_locked();

CREATE OR REPLACE FUNCTION public.post_gifts_block_when_locked()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_locked boolean;
BEGIN
  SELECT is_locked INTO v_locked FROM public.posts WHERE id = NEW.post_id;
  IF v_locked THEN
    RAISE EXCEPTION 'Bài viết đã bị khóa, không thể tặng quà.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_post_gifts_block_when_locked ON public.post_gifts;
CREATE TRIGGER trg_post_gifts_block_when_locked
  BEFORE INSERT ON public.post_gifts
  FOR EACH ROW EXECUTE FUNCTION public.post_gifts_block_when_locked();

-- 7) Feed ordering ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mixed_news_feed(
  p_user_id      uuid,
  p_limit_follow integer DEFAULT 4,
  p_limit_random integer DEFAULT 4,
  p_limit_admin  integer DEFAULT 2,
  p_offset       integer DEFAULT 0
) RETURNS SETOF public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
    FROM public.posts p
   ORDER BY
     -- 1) Bài ghim còn hiệu lực
     (p.is_pinned   AND COALESCE(p.pinned_until,   now() + interval '100 years') > now()) DESC,
     -- 2) Bài ưu tiên còn hiệu lực
     (p.is_featured AND COALESCE(p.featured_until, now() + interval '100 years') > now()) DESC,
     -- 3) Bài đôn gần nhất, rồi bài mới
     COALESCE(p.bumped_at, p.created_at) DESC,
     p.created_at DESC
   OFFSET p_offset
   LIMIT (p_limit_follow + p_limit_random + p_limit_admin);
END$$;
GRANT EXECUTE ON FUNCTION public.get_mixed_news_feed(uuid, integer, integer, integer, integer) TO authenticated;
