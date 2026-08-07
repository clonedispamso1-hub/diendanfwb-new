-- ============================================================
-- PHASE 2 — ICON VIP + GIF ĐỘC QUYỀN
-- Chạy 1 lần trong Supabase SQL Editor (project hiện tại).
-- KHÔNG đổi URL / API key / project.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Helper: ai là admin (Bang Chủ / super admin / profiles.is_admin)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vip_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
  OR coalesce(
    (SELECT true FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
      WHERE n.nspname = 'public' AND pr.proname = '_is_super_admin'
        AND public._is_super_admin()), false);
$$;
REVOKE ALL ON FUNCTION public._vip_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._vip_is_admin() TO authenticated, anon;

-- Ai được dùng tài nguyên VIP: admin HOẶC clone (account_source='internal')
CREATE OR REPLACE FUNCTION public._vip_can_use()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._vip_is_admin()
      OR coalesce((SELECT p.account_source = 'internal'
                     FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;
REVOKE ALL ON FUNCTION public._vip_can_use() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._vip_can_use() TO authenticated;

-- ------------------------------------------------------------
-- 1) BẢNG ICON VIP
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vip_icons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  url          text NOT NULL,
  storage_path text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.vip_icons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_icons TO authenticated;
GRANT ALL ON public.vip_icons TO service_role;

ALTER TABLE public.vip_icons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_icons_read ON public.vip_icons;
CREATE POLICY vip_icons_read ON public.vip_icons
  FOR SELECT TO anon, authenticated
  USING (is_active OR public._vip_is_admin());

DROP POLICY IF EXISTS vip_icons_write ON public.vip_icons;
CREATE POLICY vip_icons_write ON public.vip_icons
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

-- ------------------------------------------------------------
-- 2) BẢNG GIF ĐỘC QUYỀN + THƯ MỤC
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vip_gif_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vip_gif_folders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_gif_folders TO authenticated;
GRANT ALL ON public.vip_gif_folders TO service_role;
ALTER TABLE public.vip_gif_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_gif_folders_read ON public.vip_gif_folders;
CREATE POLICY vip_gif_folders_read ON public.vip_gif_folders
  FOR SELECT TO authenticated USING (public._vip_can_use());
DROP POLICY IF EXISTS vip_gif_folders_write ON public.vip_gif_folders;
CREATE POLICY vip_gif_folders_write ON public.vip_gif_folders
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

CREATE TABLE IF NOT EXISTS public.vip_gifs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  url          text NOT NULL,
  storage_path text,
  folder       text NOT NULL DEFAULT 'Mặc định',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS vip_gifs_folder_idx ON public.vip_gifs (folder, created_at DESC);

GRANT SELECT ON public.vip_gifs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_gifs TO authenticated;
GRANT ALL ON public.vip_gifs TO service_role;

ALTER TABLE public.vip_gifs ENABLE ROW LEVEL SECURITY;

-- Chỉ admin + clone (tài khoản thứ hai) mới ĐỌC được kho GIF độc quyền.
DROP POLICY IF EXISTS vip_gifs_read ON public.vip_gifs;
CREATE POLICY vip_gifs_read ON public.vip_gifs
  FOR SELECT TO authenticated
  USING (public._vip_can_use() AND (is_active OR public._vip_is_admin()));

DROP POLICY IF EXISTS vip_gifs_write ON public.vip_gifs;
CREATE POLICY vip_gifs_write ON public.vip_gifs
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

-- ------------------------------------------------------------
-- 3) GẮN ICON VIP VÀO PROFILE
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vip_icon_id uuid REFERENCES public.vip_icons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_vip_icon_idx ON public.profiles (vip_icon_id)
  WHERE vip_icon_id IS NOT NULL;

-- Gán / gỡ icon VIP hàng loạt (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_vip_icon(p_ids uuid[], p_icon_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF NOT public._vip_is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET vip_icon_id = p_icon_id WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_vip_icon(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_vip_icon(uuid[], uuid) TO authenticated;

-- Đọc icon VIP của 1 danh sách user (mọi người xem được — để hiển thị sau tên)
CREATE OR REPLACE FUNCTION public.vip_icons_for_users(p_ids uuid[])
RETURNS TABLE (user_id uuid, icon_id uuid, name text, url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, i.id, i.name, i.url
    FROM public.profiles p
    JOIN public.vip_icons i ON i.id = p.vip_icon_id AND i.is_active
   WHERE p.id = ANY(p_ids);
$$;
REVOKE ALL ON FUNCTION public.vip_icons_for_users(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vip_icons_for_users(uuid[]) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) STORAGE BUCKETS
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('vip_icons', 'vip_icons', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vip_gifs', 'vip_gifs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS vip_assets_public_read ON storage.objects;
CREATE POLICY vip_assets_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('vip_icons', 'vip_gifs'));

DROP POLICY IF EXISTS vip_assets_admin_write ON storage.objects;
CREATE POLICY vip_assets_admin_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('vip_icons', 'vip_gifs') AND public._vip_is_admin());

DROP POLICY IF EXISTS vip_assets_admin_update ON storage.objects;
CREATE POLICY vip_assets_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('vip_icons', 'vip_gifs') AND public._vip_is_admin());

DROP POLICY IF EXISTS vip_assets_admin_delete ON storage.objects;
CREATE POLICY vip_assets_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('vip_icons', 'vip_gifs') AND public._vip_is_admin());

-- Thư mục mặc định
INSERT INTO public.vip_gif_folders (name)
VALUES ('Mặc định')
ON CONFLICT (name) DO NOTHING;
