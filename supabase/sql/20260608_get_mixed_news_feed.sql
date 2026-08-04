-- News Feed Mixing Algorithm 4-4-2
-- 40% Follow + 40% Random (incl. bots) + 20% Admin priority
CREATE OR REPLACE FUNCTION public.get_mixed_news_feed(
  p_user_id uuid,
  p_limit_follow integer DEFAULT 4,
  p_limit_random integer DEFAULT 4,
  p_limit_admin integer DEFAULT 2,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  (
    -- NHÓM 1: Bài viết từ người đã Follow (40%)
    (
      SELECT p.* FROM public.posts p
      JOIN public.follows f ON f.following_id = p.user_id
      WHERE f.follower_id = p_user_id
      ORDER BY p.created_at DESC
      LIMIT p_limit_follow
      OFFSET p_offset
    )
    UNION ALL
    -- NHÓM 2: Bài viết do Admin ưu tiên/Ghim hoặc từ tài khoản Admin (20%)
    (
      SELECT p.* FROM public.posts p
      JOIN public.profiles prof ON prof.id = p.user_id
      WHERE prof.is_admin = true
      ORDER BY p.created_at DESC
      LIMIT p_limit_admin
      OFFSET p_offset
    )
    UNION ALL
    -- NHÓM 3: Bài viết Mới + Ngẫu nhiên từ hệ thống/Bot (40%)
    (
      SELECT p.* FROM public.posts p
      ORDER BY random()
      LIMIT p_limit_random
      OFFSET p_offset
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mixed_news_feed(uuid, integer, integer, integer, integer) TO authenticated;
