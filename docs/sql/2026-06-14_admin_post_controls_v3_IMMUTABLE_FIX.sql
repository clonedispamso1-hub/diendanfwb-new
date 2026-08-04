-- =====================================================================
-- ADMIN POST CONTROLS v3 — IMMUTABLE-safe indexes
-- Fixes: ERROR 42P17 "functions in index expression must be marked IMMUTABLE"
-- Manual run against project zbuwddjcqdlyijcunwgd (Supabase SQL Editor).
-- Idempotent. Does NOT drop columns or delete data.
--
-- Strategy: indexes must NOT call now(). We keep filter/sort cheap by:
--   - partial indexes on raw columns (is_pinned, priority_level)
--   - btree on pinned_until / priority_until / bumped_at / created_at
--   - "active" check (vs now()) is applied in the QUERY (WHERE/ORDER BY),
--     where now() is allowed; the planner still uses these indexes.
-- =====================================================================

-- 0) Admin helper -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 1) Columns on public.posts -----------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_until      timestamptz,
  ADD COLUMN IF NOT EXISTS bumped_at         timestamptz,
  ADD COLUMN IF NOT EXISTS comments_disabled boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at         timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason     text,
  ADD COLUMN IF NOT EXISTS priority_level    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_until    timestamptz,
  ADD COLUMN IF NOT EXISTS is_hidden         boolean     NOT NULL DEFAULT false;

-- 2) Drop old broken indexes from v2 (if present) --------------------
DROP INDEX IF EXISTS public.posts_feed_order_idx;
DROP INDEX IF EXISTS public.posts_pinned_active_idx;
DROP INDEX IF EXISTS public.posts_priority_active_idx;

-- 3) IMMUTABLE-safe indexes ------------------------------------------
-- Partial indexes: predicate uses only columns (no now()), so they are IMMUTABLE.
CREATE INDEX IF NOT EXISTS posts_pinned_until_idx
  ON public.posts (pinned_until DESC NULLS LAST)
  WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS posts_priority_until_idx
  ON public.posts (priority_level DESC, priority_until DESC NULLS LAST)
  WHERE priority_level > 0;

CREATE INDEX IF NOT EXISTS posts_bumped_at_idx
  ON public.posts (bumped_at DESC NULLS LAST)
  WHERE bumped_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS posts_created_at_idx
  ON public.posts (created_at DESC);

-- Optional: speed up feed scans that skip hidden posts.
CREATE INDEX IF NOT EXISTS posts_not_hidden_created_idx
  ON public.posts (created_at DESC)
  WHERE is_hidden = false;

-- 4) Admin RLS overrides ---------------------------------------------
DROP POLICY IF EXISTS "Admins can update any post" ON public.posts;
CREATE POLICY "Admins can update any post"
  ON public.posts FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete any post" ON public.posts;
CREATE POLICY "Admins can delete any post"
  ON public.posts FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

-- 5) Admin RPCs -------------------------------------------------------
-- A) PIN 2 days
CREATE OR REPLACE FUNCTION public.admin_pin_post(p_post_id uuid, p_pin boolean DEFAULT true)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- B) BUMP (first-visit-only enforced client-side via localStorage last_visit_at)
CREATE OR REPLACE FUNCTION public.admin_bump_post(p_post_id uuid)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts SET bumped_at = now() WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_bump_post(uuid) TO authenticated;

-- C) DISABLE COMMENTS
CREATE OR REPLACE FUNCTION public.admin_set_comments_disabled(p_post_id uuid, p_disabled boolean)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts SET comments_disabled = p_disabled WHERE id = p_post_id RETURNING * INTO r;
  RETURN r;
END$$;
GRANT EXECUTE ON FUNCTION public.admin_set_comments_disabled(uuid, boolean) TO authenticated;

-- D) LOCK
CREATE OR REPLACE FUNCTION public.admin_lock_post(p_post_id uuid, p_lock boolean DEFAULT true, p_reason text DEFAULT NULL)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- E) PRIORITY 3 hours
CREATE OR REPLACE FUNCTION public.admin_set_priority(p_post_id uuid, p_level int)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 6) Triggers: enforce LOCK + COMMENTS_DISABLED ----------------------
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

-- 7) Feed ordering ----------------------------------------------------
-- now() is used in the QUERY (allowed), not in any index definition.
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
   WHERE COALESCE(p.is_hidden, false) = false
   ORDER BY
     -- Pinned active first
     (p.is_pinned AND COALESCE(p.pinned_until, now() + interval '100 years') > now()) DESC,
     -- Then priority active by level
     (CASE WHEN p.priority_level > 0
                AND COALESCE(p.priority_until, now() + interval '100 years') > now()
           THEN p.priority_level ELSE 0 END) DESC,
     -- Then bumped, then created
     COALESCE(p.bumped_at, p.created_at) DESC,
     p.created_at DESC
   OFFSET p_offset
   LIMIT (p_limit_follow + p_limit_random + p_limit_admin);
END$$;
GRANT EXECUTE ON FUNCTION public.get_mixed_news_feed(uuid, integer, integer, integer, integer) TO authenticated;
