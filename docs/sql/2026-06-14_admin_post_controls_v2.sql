-- =====================================================================
-- ADMIN POST CONTROLS v2 — Pin / Bump / Disable comments / Lock / Priority
-- Manual run against project zbuwddjcqdlyijcunwgd (Supabase SQL Editor).
-- Idempotent. Does NOT touch existing data. Does NOT drop columns.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Helper: is_current_user_admin()
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
-- 1) Schema additions on public.posts
--    A) PIN  → is_pinned + pinned_until (2 days)
--    B) BUMP → bumped_at  (first-visit-only handled client-side, see §6)
--    C) COMMENTS DISABLED → comments_disabled
--    D) LOCK → is_locked + locked_at + locked_reason
--    E) PRIORITY → priority_level + priority_until (3 hours)
--    F) HIDE → is_hidden  (reserved; not required by spec but harmless)
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
  ADD COLUMN IF NOT EXISTS priority_until    timestamptz,
  ADD COLUMN IF NOT EXISTS is_hidden         boolean     NOT NULL DEFAULT false;

-- Generated "active" flags so the feed can sort cheaply on indexes.
-- (Computed each query; we use COALESCE + now() in the index expressions.)
CREATE INDEX IF NOT EXISTS posts_feed_order_idx
  ON public.posts (
    (CASE WHEN is_pinned   AND COALESCE(pinned_until,  now() + interval '100 years') > now() THEN 1 ELSE 0 END) DESC,
    (CASE WHEN priority_level > 0 AND COALESCE(priority_until, now() + interval '100 years') > now() THEN priority_level ELSE 0 END) DESC,
    COALESCE(bumped_at, created_at) DESC,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS posts_pinned_active_idx
  ON public.posts (pinned_until) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS posts_priority_active_idx
  ON public.posts (priority_until) WHERE priority_level > 0;

-- ---------------------------------------------------------------------
-- 2) Admin override RLS for posts (alongside existing owner policies)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update any post" ON public.posts;
CREATE POLICY "Admins can update any post"
  ON public.posts FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete any post" ON public.posts;
CREATE POLICY "Admins can delete any post"
  ON public.posts FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

-- ---------------------------------------------------------------------
-- 3) Admin action RPCs (SECURITY DEFINER, admin-gated)
-- ---------------------------------------------------------------------
-- A) PIN — 2 days
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

-- B) BUMP — sets bumped_at = now(); first-visit-only is enforced on client
--    (compare post.bumped_at vs localStorage `last_visit_at`).
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

-- C) DISABLE COMMENTS
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

-- D) LOCK — blocks new comments + new gem gifts
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

-- E) PRIORITY — 3 hours, level 1..5
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
-- 4) Enforcement triggers — Lock blocks new comments + new gem gifts
-- ---------------------------------------------------------------------
-- 4a) comments: block new INSERT when post is locked OR comments_disabled.
--     Existing comments are NOT touched (UPDATE/DELETE/SELECT unaffected).
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

-- 4b) post_gifts: block new gem gifts on locked posts.
--     Existing gifts and gem_transactions remain untouched.
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

-- NOTE: If your gift RPCs (gift_gem_to_post_v3 / claim_gift_gem_v3) insert
-- into post_gifts inside a SECURITY DEFINER block, the trigger above
-- still runs (triggers fire regardless of definer). That gives you the
-- "locked post receives no future gem rewards" guarantee end-to-end.

-- ---------------------------------------------------------------------
-- 5) Feed ordering — update both RPCs to honor pin / priority / bump
--    Sort: pinned-active → priority-active (by level) → bumped → created_at
-- ---------------------------------------------------------------------

-- 5a) get_mixed_news_feed
CREATE OR REPLACE FUNCTION public.get_mixed_news_feed(
  p_user_id      uuid,
  p_limit_follow integer DEFAULT 4,
  p_limit_random integer DEFAULT 4,
  p_limit_admin  integer DEFAULT 2,
  p_offset       integer DEFAULT 0
) RETURNS SETOF public.posts
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH pinned AS (
    SELECT p.* FROM public.posts p
    WHERE p.is_pinned = true
      AND COALESCE(p.pinned_until, now() + interval '100 years') > now()
      AND COALESCE(p.is_hidden, false) = false
    ORDER BY p.pinned_until DESC NULLS LAST, p.created_at DESC
  ),
  priority AS (
    SELECT p.* FROM public.posts p
    WHERE p.priority_level > 0
      AND COALESCE(p.priority_until, now() + interval '100 years') > now()
      AND COALESCE(p.is_hidden, false) = false
      AND p.id NOT IN (SELECT id FROM pinned)
    ORDER BY p.priority_level DESC, p.created_at DESC
  ),
  follow_posts AS (
    SELECT p.* FROM public.posts p
    JOIN public.follows f ON f.following_id = p.user_id
    WHERE f.follower_id = p_user_id
      AND p.id NOT IN (SELECT id FROM pinned UNION SELECT id FROM priority)
    ORDER BY COALESCE(p.bumped_at, p.created_at) DESC
    LIMIT p_limit_follow OFFSET p_offset
  ),
  admin_posts AS (
    SELECT p.* FROM public.posts p
    JOIN public.profiles prof ON prof.id = p.user_id
    WHERE prof.is_admin = true
      AND p.id NOT IN (SELECT id FROM pinned UNION SELECT id FROM priority UNION SELECT id FROM follow_posts)
    ORDER BY COALESCE(p.bumped_at, p.created_at) DESC
    LIMIT p_limit_admin OFFSET p_offset
  ),
  random_posts AS (
    SELECT p.* FROM public.posts p
    WHERE p.id NOT IN (
      SELECT id FROM pinned UNION SELECT id FROM priority
      UNION SELECT id FROM follow_posts UNION SELECT id FROM admin_posts
    )
    ORDER BY random()
    LIMIT p_limit_random OFFSET p_offset
  )
  SELECT * FROM pinned
  UNION ALL SELECT * FROM priority
  UNION ALL SELECT * FROM follow_posts
  UNION ALL SELECT * FROM admin_posts
  UNION ALL SELECT * FROM random_posts;
END$$;
GRANT EXECUTE ON FUNCTION public.get_mixed_news_feed(uuid, integer, integer, integer, integer) TO authenticated;

-- 5b) get_personalized_feed — prepend pinned + priority slices
CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  p_user_id uuid,
  p_limit   int DEFAULT 20,
  p_offset  int DEFAULT 0
) RETURNS SETOF public.posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n_latest int; n_admin int; n_viral int; n_friend int;
BEGIN
  n_latest := GREATEST(1, ROUND(p_limit * 0.54)::int);
  n_admin  := GREATEST(1, ROUND(p_limit * 0.16)::int);
  n_viral  := GREATEST(1, ROUND(p_limit * 0.19)::int);
  n_friend := GREATEST(1, p_limit - n_latest - n_admin - n_viral);

  RETURN QUERY
  WITH pinned AS (
    SELECT p.* FROM public.posts p
    WHERE p.is_pinned = true
      AND COALESCE(p.pinned_until, now() + interval '100 years') > now()
      AND COALESCE(p.is_hidden, false) = false
  ),
  priority AS (
    SELECT p.* FROM public.posts p
    WHERE p.priority_level > 0
      AND COALESCE(p.priority_until, now() + interval '100 years') > now()
      AND COALESCE(p.is_hidden, false) = false
      AND p.id NOT IN (SELECT id FROM pinned)
    ORDER BY p.priority_level DESC, p.created_at DESC
  ),
  latest AS (
    SELECT p.* FROM public.posts p
    WHERE p.id NOT IN (SELECT id FROM pinned UNION SELECT id FROM priority)
    ORDER BY COALESCE(p.bumped_at, p.created_at) DESC
    LIMIT n_latest OFFSET p_offset
  ),
  admin_posts AS (
    SELECT p.* FROM public.posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE pr.is_admin = true
      AND p.id NOT IN (SELECT id FROM pinned UNION SELECT id FROM priority UNION SELECT id FROM latest)
    ORDER BY p.created_at DESC
    LIMIT n_admin OFFSET p_offset
  ),
  viral_posts AS (
    SELECT p.* FROM public.posts p
    LEFT JOIN (SELECT post_id, COUNT(*)::int c FROM public.likes      GROUP BY post_id) lk ON lk.post_id = p.id
    LEFT JOIN (SELECT post_id, COUNT(*)::int c FROM public.post_gifts GROUP BY post_id) gf ON gf.post_id = p.id
    WHERE p.created_at > now() - interval '14 days'
      AND p.id NOT IN (SELECT id FROM pinned UNION SELECT id FROM priority
                       UNION SELECT id FROM latest UNION SELECT id FROM admin_posts)
    ORDER BY (COALESCE(lk.c,0) + COALESCE(gf.c,0) * 3) DESC NULLS LAST, p.created_at DESC
    LIMIT n_viral OFFSET p_offset
  ),
  friend_posts AS (
    SELECT p.* FROM public.posts p
    JOIN public.follows f ON f.following_id = p.user_id
    WHERE f.follower_id = p_user_id
      AND p.id NOT IN (SELECT id FROM pinned UNION SELECT id FROM priority
                       UNION SELECT id FROM latest UNION SELECT id FROM admin_posts
                       UNION SELECT id FROM viral_posts)
    ORDER BY p.created_at DESC
    LIMIT n_friend OFFSET p_offset
  )
  SELECT * FROM pinned
  UNION ALL SELECT * FROM priority
  UNION ALL SELECT * FROM latest
  UNION ALL SELECT * FROM admin_posts
  UNION ALL SELECT * FROM viral_posts
  UNION ALL SELECT * FROM friend_posts;
END$$;
GRANT EXECUTE ON FUNCTION public.get_personalized_feed(uuid, int, int) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) BUMP "first-visit-only" — design note
-- ---------------------------------------------------------------------
-- The DB stores ONLY `bumped_at` (an absolute timestamp).
-- The "show bumped post on the visitor's FIRST visit only" rule is enforced
-- on the client:
--   • On app boot, read `localStorage.last_visit_at` (ISO string).
--   • A post is considered "bump-eligible for this visitor" iff
--       post.bumped_at IS NOT NULL
--       AND post.bumped_at > (last_visit_at OR epoch).
--   • After the feed renders, write `last_visit_at = new Date().toISOString()`.
-- This keeps the DB stateless w.r.t. per-visitor seen-state (which would
-- otherwise need a `post_seen_by_user` table — proposed only if you want
-- server-side correctness across devices; say the word and I'll draft it).

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
