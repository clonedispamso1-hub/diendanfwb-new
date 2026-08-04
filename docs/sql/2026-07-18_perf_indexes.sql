-- ============================================================
-- ZaLove — Performance indexes (feed / likes / comments / views / follows)
-- Created: 2026-07-18
--
-- CHẠY THỦ CÔNG trên Supabase SQL Editor (KHÔNG auto-migration).
-- Toàn bộ dùng CREATE INDEX IF NOT EXISTS + CONCURRENTLY để không lock table.
-- Có thể chạy lại nhiều lần an toàn.
--
-- Trước khi chạy: kiểm tra tên cột thực tế (dưới đây theo schema đang dùng).
-- ============================================================

-- ---------- posts: feed listing (visibility != 'feedback', order by created_at DESC) ----------
CREATE INDEX IF NOT EXISTS idx_posts_visibility_created_at
  ON public.posts (visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_user_created_at
  ON public.posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_pinned_partial
  ON public.posts (created_at DESC)
  WHERE is_pinned = true;

-- ---------- likes: count(*) filter=post_id, unique(user_id, post_id) ----------
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes (post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_post ON public.likes (user_id, post_id);

-- ---------- comments: count(*) filter=post_id + list by created_at ----------
CREATE INDEX IF NOT EXISTS idx_comments_post_created_at
  ON public.comments (post_id, created_at DESC);

-- ---------- post_views: unique upsert (post_id, user_id) + count filter=post_id ----------
CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON public.post_views (post_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_post_views_post_user
  ON public.post_views (post_id, user_id);

-- ---------- follows: follower feed + follower/following counts ----------
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_follows_pair
  ON public.follows (follower_id, following_id);

-- ---------- post_gifts: totalGifted sum by post_id ----------
CREATE INDEX IF NOT EXISTS idx_post_gifts_post_id ON public.post_gifts (post_id);

-- ---------- user_blocks: blocker lookup on feed ----------
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks (blocker_id);

-- ---------- notifications: user_id + created_at DESC ----------
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications (user_id, created_at DESC);

-- ---------- profiles: is_admin partial (feed reads admin ids) ----------
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin_partial
  ON public.profiles (id)
  WHERE is_admin = true;

-- Xong. Chạy: EXPLAIN ANALYZE trên các query chậm để xác nhận index được dùng.
