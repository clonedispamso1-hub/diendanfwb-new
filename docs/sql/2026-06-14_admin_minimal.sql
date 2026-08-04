-- =====================================================================
-- ADMIN POST CONTROLS — MINIMAL (no indexes, no feed ranking)
-- Run manually in Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Idempotent. Only adds columns / functions / triggers / RLS needed
-- for 5 Admin buttons: PIN, BUMP, DISABLE COMMENTS, LOCK, PRIORITY.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columns on public.posts
-- ---------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_until      timestamptz,
  ADD COLUMN IF NOT EXISTS bumped_at         timestamptz,
  ADD COLUMN IF NOT EXISTS comments_disabled boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at         timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason     text,
  ADD COLUMN IF NOT EXISTS priority_level    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_until    timestamptz;

-- ---------------------------------------------------------------------
-- 2) Admin helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Admin RLS overrides (alongside existing owner policies)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update any post" ON public.posts;
CREATE POLICY "Admins can update any post"
  ON public.posts FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ---------------------------------------------------------------------
-- 4) Admin RPCs
-- ---------------------------------------------------------------------

-- 4A) PIN — 2 days
CREATE OR REPLACE FUNCTION public.admin_pin_post(p_post_id uuid, p_pin boolean DEFAULT true)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts
     SET is_pinned    = p_pin,
         pinned_until = CASE WHEN p_pin THEN now() + interval '2 days' ELSE NULL END
   WHERE id = p_post_id
  RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_pin_post(uuid, boolean) TO authenticated;

-- 4B) BUMP — set bumped_at = now()
CREATE OR REPLACE FUNCTION public.admin_bump_post(p_post_id uuid)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts SET bumped_at = now() WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_bump_post(uuid) TO authenticated;

-- 4C) DISABLE COMMENTS
CREATE OR REPLACE FUNCTION public.admin_set_comments_disabled(p_post_id uuid, p_disabled boolean)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts SET comments_disabled = p_disabled WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_set_comments_disabled(uuid, boolean) TO authenticated;

-- 4D) LOCK
CREATE OR REPLACE FUNCTION public.admin_lock_post(p_post_id uuid, p_lock boolean DEFAULT true, p_reason text DEFAULT NULL)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts
     SET is_locked     = p_lock,
         locked_at     = CASE WHEN p_lock THEN now() ELSE NULL END,
         locked_reason = CASE WHEN p_lock THEN p_reason ELSE NULL END
   WHERE id = p_post_id
  RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_lock_post(uuid, boolean, text) TO authenticated;

-- 4E) PRIORITY — 3 hours, level 0..5
CREATE OR REPLACE FUNCTION public.admin_set_priority(p_post_id uuid, p_level int)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_level < 0 OR p_level > 5 THEN RAISE EXCEPTION 'priority must be 0..5'; END IF;
  UPDATE public.posts
     SET priority_level = p_level,
         priority_until = CASE WHEN p_level > 0 THEN now() + interval '3 hours' ELSE NULL END
   WHERE id = p_post_id
  RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_set_priority(uuid, int) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Enforcement triggers (LOCK / DISABLE COMMENTS)
-- ---------------------------------------------------------------------

-- 5a) Block new comments when post is locked OR comments_disabled
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
    RAISE EXCEPTION 'Bình luận đã bị tắt cho bài viết này.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_comments_block_when_locked ON public.comments;
CREATE TRIGGER trg_comments_block_when_locked
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_block_when_locked();

-- 5b) Block new gem gifts when post is locked
CREATE OR REPLACE FUNCTION public.post_gifts_block_when_locked()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_locked boolean;
BEGIN
  SELECT is_locked INTO v_locked FROM public.posts WHERE id = NEW.post_id;
  IF v_locked THEN
    RAISE EXCEPTION 'Bài viết đã bị khóa, không thể tặng Gem.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_post_gifts_block_when_locked ON public.post_gifts;
CREATE TRIGGER trg_post_gifts_block_when_locked
  BEFORE INSERT ON public.post_gifts
  FOR EACH ROW EXECUTE FUNCTION public.post_gifts_block_when_locked();

-- =====================================================================
-- END
-- =====================================================================
