-- ============================================================
-- FIX HOÀN TOÀN MODULE "QUẢN LÝ ICON VIP" (+ KHO GIF VIP)
-- Chạy 1 lần trong Supabase SQL Editor của project HIỆN TẠI.
-- KHÔNG đổi URL / API key / project / cấu trúc dữ liệu cũ.
-- An toàn khi chạy lại nhiều lần (idempotent).
--
-- NGUYÊN NHÂN GỐC của "upload xong không hiện icon":
--   File đã lên Cloudinary nhưng INSERT vào public.vip_icons bị RLS chặn,
--   vì policy cũ gọi public._vip_is_admin() -> _is_super_admin() (hàm có thể
--   không tồn tại) trong khi toàn app xác định admin bằng profiles.is_admin.
--   Kết quả: bảng vip_icons rỗng => danh sách trống.
-- ============================================================

-- ------------------------------------------------------------
-- 0) ADMIN CHECK — đúng nguồn sự thật mà app đang dùng
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT p.is_admin FROM public.profiles p WHERE p.id = _user_id), false)
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._vip_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid())
$$;
REVOKE ALL ON FUNCTION public._vip_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._vip_is_admin() TO anon, authenticated;

-- Ai được DÙNG tài nguyên VIP: Admin / Super Admin / clone (account_source='internal')
CREATE OR REPLACE FUNCTION public._vip_can_use()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._vip_is_admin()
      OR coalesce((SELECT p.account_source = 'internal'
                     FROM public.profiles p WHERE p.id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public._vip_can_use() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._vip_can_use() TO authenticated;

-- ------------------------------------------------------------
-- 1) CỘT METADATA CLOUDINARY (không đụng cột cũ)
-- ------------------------------------------------------------
ALTER TABLE public.vip_icons
  ADD COLUMN IF NOT EXISTS folder       text NOT NULL DEFAULT 'Mặc định',
  ADD COLUMN IF NOT EXISTS use_count    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_id    text,
  ADD COLUMN IF NOT EXISTS secure_url   text,
  ADD COLUMN IF NOT EXISTS bytes        bigint,
  ADD COLUMN IF NOT EXISTS width        int,
  ADD COLUMN IF NOT EXISTS height       int,
  ADD COLUMN IF NOT EXISTS cloud_folder text;

ALTER TABLE public.vip_gifs
  ADD COLUMN IF NOT EXISTS folder       text NOT NULL DEFAULT 'Mặc định',
  ADD COLUMN IF NOT EXISTS use_count    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_id    text,
  ADD COLUMN IF NOT EXISTS secure_url   text,
  ADD COLUMN IF NOT EXISTS bytes        bigint,
  ADD COLUMN IF NOT EXISTS width        int,
  ADD COLUMN IF NOT EXISTS height       int,
  ADD COLUMN IF NOT EXISTS cloud_folder text;

ALTER TABLE public.vip_icons ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.vip_gifs  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ------------------------------------------------------------
-- 2) GRANTS + RLS
-- ------------------------------------------------------------
GRANT SELECT ON public.vip_icons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_icons TO authenticated;
GRANT ALL ON public.vip_icons TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_gifs TO authenticated;
GRANT ALL ON public.vip_gifs TO service_role;

ALTER TABLE public.vip_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_gifs  ENABLE ROW LEVEL SECURITY;

-- Icon VIP: ai cũng ĐỌC được (để hiển thị sau tên thành viên) — chỉ admin GHI.
DROP POLICY IF EXISTS vip_icons_read ON public.vip_icons;
DROP POLICY IF EXISTS vip_icons_write ON public.vip_icons;
DROP POLICY IF EXISTS vip_icons_admin_write ON public.vip_icons;
CREATE POLICY vip_icons_read ON public.vip_icons
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY vip_icons_admin_write ON public.vip_icons
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

-- GIF VIP: CHỈ admin + clone mới đọc được (thành viên thường không thấy).
DROP POLICY IF EXISTS vip_gifs_read ON public.vip_gifs;
DROP POLICY IF EXISTS vip_gifs_write ON public.vip_gifs;
DROP POLICY IF EXISTS vip_gifs_admin_write ON public.vip_gifs;
CREATE POLICY vip_gifs_read ON public.vip_gifs
  FOR SELECT TO authenticated
  USING (public._vip_can_use() AND (is_active OR public._vip_is_admin()));
CREATE POLICY vip_gifs_admin_write ON public.vip_gifs
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

-- ------------------------------------------------------------
-- 3) THƯ MỤC
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vip_icon_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.vip_gif_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vip_icon_folders TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_icon_folders TO authenticated;
GRANT ALL ON public.vip_icon_folders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_gif_folders TO authenticated;
GRANT ALL ON public.vip_gif_folders TO service_role;

ALTER TABLE public.vip_icon_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_gif_folders  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_icon_folders_read ON public.vip_icon_folders;
CREATE POLICY vip_icon_folders_read ON public.vip_icon_folders
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS vip_icon_folders_write ON public.vip_icon_folders;
CREATE POLICY vip_icon_folders_write ON public.vip_icon_folders
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

DROP POLICY IF EXISTS vip_gif_folders_read ON public.vip_gif_folders;
CREATE POLICY vip_gif_folders_read ON public.vip_gif_folders
  FOR SELECT TO authenticated USING (public._vip_can_use());
DROP POLICY IF EXISTS vip_gif_folders_write ON public.vip_gif_folders;
CREATE POLICY vip_gif_folders_write ON public.vip_gif_folders
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

INSERT INTO public.vip_icon_folders (name) VALUES
  ('Mặc định'), ('Telegram'), ('Anime'), ('Neon'), ('VIP'),
  ('Crown'), ('Event'), ('Love'), ('Tết'), ('Noel')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.vip_gif_folders (name) VALUES
  ('Mặc định'), ('Telegram'), ('Anime'), ('Love'), ('Neon'),
  ('Game'), ('Premium'), ('Cute'), ('Emoji'), ('Sticker')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 4) THỐNG KÊ SỬ DỤNG
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vip_gifs_bump_use(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;
  UPDATE public.vip_gifs g SET use_count = coalesce(g.use_count, 0) + 1
   WHERE g.id = ANY(p_ids);
END; $$;
REVOKE ALL ON FUNCTION public.vip_gifs_bump_use(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vip_gifs_bump_use(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.vip_icons_bump_use(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;
  UPDATE public.vip_icons i SET use_count = coalesce(i.use_count, 0) + 1
   WHERE i.id = ANY(p_ids);
END; $$;
REVOKE ALL ON FUNCTION public.vip_icons_bump_use(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vip_icons_bump_use(uuid[]) TO authenticated;

-- ------------------------------------------------------------
-- 5) KIỂM TRA NHANH (đăng nhập bằng tài khoản admin rồi chạy)
--    SELECT public._vip_is_admin();  -- phải là true
--    SELECT count(*) FROM public.vip_icons;
-- ------------------------------------------------------------
