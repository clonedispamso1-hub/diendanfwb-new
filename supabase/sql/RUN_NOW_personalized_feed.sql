-- =====================================================================
--  PERSONALIZED FEED — Tab "Dành cho bạn"
--  Tỷ lệ phân phối: 54% mới nhất · 16% admin · 19% viral · 11% bạn bè/follow
--  Chạy trong Supabase SQL Editor.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  p_user_id uuid,
  p_limit   int DEFAULT 20,
  p_offset  int DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_latest int;
  n_admin  int;
  n_viral  int;
  n_friend int;
BEGIN
  -- Phân bổ slot theo % nghiêm ngặt, đảm bảo tổng = p_limit và mỗi nhóm >= 1.
  n_latest := GREATEST(1, ROUND(p_limit * 0.54)::int);
  n_admin  := GREATEST(1, ROUND(p_limit * 0.16)::int);
  n_viral  := GREATEST(1, ROUND(p_limit * 0.19)::int);
  n_friend := GREATEST(1, p_limit - n_latest - n_admin - n_viral);

  RETURN QUERY
  WITH
  latest AS (
    SELECT p.*
    FROM public.posts p
    ORDER BY p.created_at DESC
    LIMIT n_latest OFFSET p_offset
  ),
  admin_posts AS (
    SELECT p.*
    FROM public.posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE pr.is_admin = true
    ORDER BY p.created_at DESC
    LIMIT n_admin OFFSET p_offset
  ),
  viral_posts AS (
    SELECT p.*
    FROM public.posts p
    LEFT JOIN (
      SELECT post_id, COUNT(*)::int AS c FROM public.likes GROUP BY post_id
    ) lk ON lk.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*)::int AS c FROM public.post_gifts GROUP BY post_id
    ) gf ON gf.post_id = p.id
    WHERE p.created_at > now() - interval '14 days'
    ORDER BY (COALESCE(lk.c,0) + COALESCE(gf.c,0) * 3) DESC NULLS LAST,
             p.created_at DESC
    LIMIT n_viral OFFSET p_offset
  ),
  friend_posts AS (
    SELECT p.*
    FROM public.posts p
    JOIN public.follows f ON f.following_id = p.user_id
    WHERE f.follower_id = p_user_id
    ORDER BY p.created_at DESC
    LIMIT n_friend OFFSET p_offset
  ),
  unioned AS (
    SELECT * FROM latest
    UNION
    SELECT * FROM admin_posts
    UNION
    SELECT * FROM viral_posts
    UNION
    SELECT * FROM friend_posts
  )
  SELECT * FROM unioned
  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_personalized_feed(uuid, int, int) TO authenticated, anon;
