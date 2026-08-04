-- =====================================================================
-- PATCH: Engagement Booster — dùng đúng admin auth hiện tại (bangchu).
-- Chạy 1 lần trong Supabase SQL Editor để fix lỗi "forbidden".
--
-- Không dùng public.has_role() và không tạo role system mới.
-- Logic khớp Admin Panel: row trong public.bangchu phải approved + active.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._engagement_is_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bangchu b
    WHERE b.auth_user_id = _user
      AND b.status = 'approved'
      AND b.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public._engagement_is_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "admin read campaigns" ON public.engagement_campaigns;
CREATE POLICY "admin read campaigns" ON public.engagement_campaigns
  FOR SELECT TO authenticated
  USING (public._engagement_is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin read events" ON public.engagement_events;
CREATE POLICY "admin read events" ON public.engagement_events
  FOR SELECT TO authenticated
  USING (public._engagement_is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public._engagement_require_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._engagement_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public._engagement_require_admin() TO authenticated;