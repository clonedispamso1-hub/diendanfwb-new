-- =====================================================================
-- PHASE 3.4 — HỆ THỐNG QUAN TÂM / MATCH 2 CHIỀU / THÔNG BÁO (NEARBY)
-- =====================================================================
-- CHẠY THỦ CÔNG file này trên Supabase SQL Editor (DB cũ).
-- HOÀN TOÀN TÁCH BIỆT — KHÔNG sửa bảng cũ:
--   user_locations, location_ready, posts, chats, gems, vip,
--   connection_requests, fwb_likes, profiles, notifications.
-- Tạo MỚI:
--   1) public.nearby_interests           — lượt ❤️ "quan tâm"
--   2) public.nearby_match_notifications — thông báo riêng cho nearby
--   3) Trigger + RPC phục vụ UI Phase 3.4 (toggle, list, match)
-- =====================================================================

-- 1) Bảng "quan tâm" ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nearby_interests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nearby_interests_no_self CHECK (from_user <> to_user),
  CONSTRAINT nearby_interests_unique UNIQUE (from_user, to_user)
);

CREATE INDEX IF NOT EXISTS nearby_interests_from_idx
  ON public.nearby_interests (from_user, created_at DESC);
CREATE INDEX IF NOT EXISTS nearby_interests_to_idx
  ON public.nearby_interests (to_user, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.nearby_interests TO authenticated;
GRANT ALL ON public.nearby_interests TO service_role;

ALTER TABLE public.nearby_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nearby_interests_select_self" ON public.nearby_interests;
CREATE POLICY "nearby_interests_select_self"
  ON public.nearby_interests FOR SELECT TO authenticated
  USING (from_user = auth.uid() OR to_user = auth.uid());

DROP POLICY IF EXISTS "nearby_interests_insert_self" ON public.nearby_interests;
CREATE POLICY "nearby_interests_insert_self"
  ON public.nearby_interests FOR INSERT TO authenticated
  WITH CHECK (from_user = auth.uid());

DROP POLICY IF EXISTS "nearby_interests_delete_self" ON public.nearby_interests;
CREATE POLICY "nearby_interests_delete_self"
  ON public.nearby_interests FOR DELETE TO authenticated
  USING (from_user = auth.uid());

-- 2) Bảng thông báo riêng cho Nearby -----------------------------------
CREATE TABLE IF NOT EXISTS public.nearby_match_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_user   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('interest','match')),
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nearby_notif_user_idx
  ON public.nearby_match_notifications (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.nearby_match_notifications TO authenticated;
GRANT ALL ON public.nearby_match_notifications TO service_role;

ALTER TABLE public.nearby_match_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nearby_notif_select_own" ON public.nearby_match_notifications;
CREATE POLICY "nearby_notif_select_own"
  ON public.nearby_match_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nearby_notif_update_own" ON public.nearby_match_notifications;
CREATE POLICY "nearby_notif_update_own"
  ON public.nearby_match_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nearby_notif_delete_own" ON public.nearby_match_notifications;
CREATE POLICY "nearby_notif_delete_own"
  ON public.nearby_match_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3) Trigger: tạo thông báo + phát hiện MATCH --------------------------
CREATE OR REPLACE FUNCTION public.fn_nearby_interest_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reciprocal_exists boolean;
BEGIN
  INSERT INTO public.nearby_match_notifications (user_id, from_user, kind)
  VALUES (NEW.to_user, NEW.from_user, 'interest');

  SELECT EXISTS (
    SELECT 1 FROM public.nearby_interests
    WHERE from_user = NEW.to_user AND to_user = NEW.from_user
  ) INTO reciprocal_exists;

  IF reciprocal_exists THEN
    INSERT INTO public.nearby_match_notifications (user_id, from_user, kind) VALUES
      (NEW.from_user, NEW.to_user, 'match'),
      (NEW.to_user,   NEW.from_user, 'match');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nearby_interest_after_insert ON public.nearby_interests;
CREATE TRIGGER trg_nearby_interest_after_insert
AFTER INSERT ON public.nearby_interests
FOR EACH ROW EXECUTE FUNCTION public.fn_nearby_interest_after_insert();

-- 4) RPC toggle Quan tâm (chống spam 100/ngày) -------------------------
CREATE OR REPLACE FUNCTION public.toggle_nearby_interest(_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  daily_count int;
  existed boolean;
  matched boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF _target IS NULL OR _target = me THEN
    RAISE EXCEPTION 'Invalid target' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.nearby_interests
    WHERE from_user = me AND to_user = _target
  ) INTO existed;

  IF existed THEN
    DELETE FROM public.nearby_interests
     WHERE from_user = me AND to_user = _target;
    RETURN jsonb_build_object('liked', false, 'matched', false);
  END IF;

  SELECT COUNT(*) INTO daily_count
  FROM public.nearby_interests
  WHERE from_user = me AND created_at > now() - interval '1 day';

  IF daily_count >= 100 THEN
    RAISE EXCEPTION 'Daily interest limit reached'
      USING ERRCODE = 'P0001',
            HINT = 'Bạn đã đạt giới hạn 100 lượt quan tâm/ngày.';
  END IF;

  INSERT INTO public.nearby_interests (from_user, to_user) VALUES (me, _target);

  SELECT EXISTS (
    SELECT 1 FROM public.nearby_interests
    WHERE from_user = _target AND to_user = me
  ) INTO matched;

  RETURN jsonb_build_object('liked', true, 'matched', matched);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_nearby_interest(uuid) TO authenticated;

-- 5) RPC: những người mình đã quan tâm ---------------------------------
CREATE OR REPLACE FUNCTION public.list_nearby_interests()
RETURNS TABLE(to_user uuid, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_user, created_at
  FROM public.nearby_interests
  WHERE from_user = auth.uid()
  ORDER BY created_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.list_nearby_interests() TO authenticated;

-- 6) RPC: MATCH 2 chiều (đã kết nối) -----------------------------------
CREATE OR REPLACE FUNCTION public.list_nearby_matches()
RETURNS TABLE(other_id uuid, matched_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.to_user AS other_id,
    GREATEST(a.created_at, b.created_at) AS matched_at
  FROM public.nearby_interests a
  JOIN public.nearby_interests b
    ON b.from_user = a.to_user AND b.to_user = a.from_user
  WHERE a.from_user = auth.uid()
  ORDER BY matched_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.list_nearby_matches() TO authenticated;
