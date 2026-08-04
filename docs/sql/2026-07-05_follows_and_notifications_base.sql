-- =====================================================================
-- 2026-07-05  Base tables for Follow + Notifications
--   Chạy idempotent trên DB cũ. Nếu bảng đã tồn tại thì các lệnh
--   IF NOT EXISTS / IF NOT sẽ bỏ qua, không mất dữ liệu.
-- =====================================================================

-- 1) Follows -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follows_owner_insert ON public.follows;
CREATE POLICY follows_owner_insert ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS follows_owner_delete ON public.follows;
CREATE POLICY follows_owner_delete ON public.follows
  FOR DELETE TO authenticated
  USING (follower_id = auth.uid());

DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows
  FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

-- 2) Notifications (base schema) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             text NOT NULL,
  title            text,
  message          text,
  is_read          boolean NOT NULL DEFAULT false,
  is_claimed       boolean NOT NULL DEFAULT false,
  is_pending_claim boolean NOT NULL DEFAULT false,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifs_owner_all ON public.notifications;
CREATE POLICY notifs_owner_all ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_claimed ON public.notifications(user_id) WHERE is_claimed = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_pending ON public.notifications(user_id) WHERE is_pending_claim = true;
