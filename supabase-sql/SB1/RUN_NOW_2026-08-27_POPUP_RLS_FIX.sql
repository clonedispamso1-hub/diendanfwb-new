-- =====================================================================
-- FIX: new row violates row-level security policy for table "admin_popups"
--
-- Nguyên nhân: public.is_admin() chỉ nhận admin trong bảng `bangchu`
-- (approved + active). Admin đăng nhập bằng cờ profiles.is_admin bị chặn.
--
-- File này CHỈ sửa quyền cho admin_popups (không đụng bảng khác):
--   • is_admin(uuid): bangchu approved/active  HOẶC  profiles.is_admin = true
--   • admin_popups: anon/authenticated ĐỌC popup đang bật; admin INSERT/UPDATE/DELETE
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.bangchu
      WHERE auth_user_id = _uid AND status = 'approved' AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _uid AND is_admin = true
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;

-- ---------- Grants (bắt buộc cho Data API) ----------
GRANT SELECT ON public.admin_popups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_popups TO authenticated;
GRANT ALL ON public.admin_popups TO service_role;

ALTER TABLE public.admin_popups ENABLE ROW LEVEL SECURITY;

-- ---------- Policies ----------
DROP POLICY IF EXISTS popups_read_all      ON public.admin_popups;
DROP POLICY IF EXISTS popups_read_active   ON public.admin_popups;
DROP POLICY IF EXISTS popups_admin_write   ON public.admin_popups;
DROP POLICY IF EXISTS popups_admin_update  ON public.admin_popups;
DROP POLICY IF EXISTS popups_admin_delete  ON public.admin_popups;

-- User thường: chỉ ĐỌC (admin đọc được cả popup đang tắt để chỉnh cấu hình).
CREATE POLICY popups_read_active ON public.admin_popups
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR public.is_admin(auth.uid()));

CREATE POLICY popups_admin_write ON public.admin_popups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY popups_admin_update ON public.admin_popups
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY popups_admin_delete ON public.admin_popups
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

COMMIT;

-- Reload schema cache của PostgREST
NOTIFY pgrst, 'reload schema';
