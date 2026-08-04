-- =====================================================================
-- 2026-07-06  Task #1 — Follow realtime + notification via trigger
--
-- Chạy idempotent trên DB cũ. Không đụng tới dữ liệu hiện có của bảng
-- follows / notifications. Chỉ:
--   - Bổ sung 2 trigger + 2 function (SECURITY DEFINER) để tạo/xoá
--     notification "follow" bằng quyền definer, tránh bị RLS chặn.
--   - Bật REPLICA IDENTITY FULL + add vào publication supabase_realtime
--     cho follows + notifications để phía client subscribe realtime.
--   - Thêm index hỗ trợ dedup nhanh.
-- =====================================================================

-- 0) Yêu cầu 2 bảng nền đã tồn tại (2026-07-05_follows_and_notifications_base.sql).
--    Không CREATE TABLE ở đây để tránh chạm schema.

-- 1) Index hỗ trợ dedup notification theo actor_id trong jsonb ---------
CREATE INDEX IF NOT EXISTS idx_notifications_follow_actor
  ON public.notifications ((data->>'actor_id'))
  WHERE type IN ('follow', 'new_follower');

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications (user_id, type, created_at DESC);

-- 2) Function: tạo notification khi có follow mới ---------------------
CREATE OR REPLACE FUNCTION public.handle_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name    text;
  actor_avatar  text;
  actor_uname   text;
BEGIN
  -- Không gửi notif cho chính mình.
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  -- Lấy profile actor (best-effort).
  SELECT p.full_name, p.avatar, p.username
    INTO actor_name, actor_avatar, actor_uname
    FROM public.profiles p
   WHERE p.id = NEW.follower_id;

  -- Dedup: xoá mọi notif follow cũ từ actor -> target trước khi insert
  DELETE FROM public.notifications
   WHERE user_id = NEW.following_id
     AND type IN ('follow', 'new_follower')
     AND (data->>'actor_id')::uuid = NEW.follower_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, is_read, data)
  VALUES (
    NEW.following_id,
    'follow',
    'Người theo dõi mới',
    COALESCE(actor_name, actor_uname, 'Ai đó') || ' vừa theo dõi bạn',
    false,
    jsonb_build_object(
      'actor_id',     NEW.follower_id,
      'actor_name',   COALESCE(actor_name, actor_uname, 'Ai đó'),
      'actor_avatar', actor_avatar,
      'actor_username', actor_uname
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_follow_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_follow_insert() TO authenticated, service_role;

-- 3) Function: xoá notification khi unfollow --------------------------
CREATE OR REPLACE FUNCTION public.handle_follow_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE user_id = OLD.following_id
     AND type IN ('follow', 'new_follower')
     AND (data->>'actor_id')::uuid = OLD.follower_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_follow_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_follow_delete() TO authenticated, service_role;

-- 4) Trigger ---------------------------------------------------------
DROP TRIGGER IF EXISTS trg_follow_insert_notify ON public.follows;
CREATE TRIGGER trg_follow_insert_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_follow_insert();

DROP TRIGGER IF EXISTS trg_follow_delete_notify ON public.follows;
CREATE TRIGGER trg_follow_delete_notify
  AFTER DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_follow_delete();

-- 5) Realtime --------------------------------------------------------
ALTER TABLE public.follows       REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'follows'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.follows';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- 6) RPC: đếm nhanh followers/following (dùng cho profile) -----------
CREATE OR REPLACE FUNCTION public.follow_counts(_user_id uuid)
RETURNS TABLE (followers_count int, following_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.follows WHERE following_id = _user_id),
    (SELECT count(*)::int FROM public.follows WHERE follower_id  = _user_id);
$$;

REVOKE ALL ON FUNCTION public.follow_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.follow_counts(uuid) TO anon, authenticated, service_role;

-- 7) Cho phép mọi authenticated user SELECT follows (đọc số follower/following của người khác)
DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows
  FOR SELECT TO authenticated
  USING (true);
