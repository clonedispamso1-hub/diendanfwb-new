-- ============================================================================
-- CHẠY TRÊN: SUPABASE #1 (core / auth / profiles) — project gxfxqbhxoghdhokwjpex
-- KHÔNG chạy trên Supabase #2 (media) và #3 (logs).
--
-- Mục đích: fix lỗi
--   - relation "public.gif_library" does not exist   (Kho GIF + Sticker dùng chung)
--   - relation "public.vip_icons"  does not exist    (Kho Icon VIP — Admin Panel)
--
-- File thật (GIF / Sticker / Icon) nằm trên **Cloudinary**; bảng dưới đây chỉ
-- lưu URL + metadata. Không dùng Storage của Supabase #2 cho các kho này.
--
-- An toàn: idempotent (chạy lại nhiều lần OK), KHÔNG xoá dữ liệu cũ,
-- KHÔNG tạo trigger, chỉ thêm bảng/cột/policy còn thiếu.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Hàm kiểm tra admin (dùng cho mọi policy ghi). Tự dò các cơ chế có sẵn:
--    public.has_role(uid,'admin') → profiles.is_admin → public._is_super_admin()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._media_is_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  BEGIN
    EXECUTE 'SELECT public.has_role(auth.uid(), ''admin''::public.app_role)' INTO v;
    IF coalesce(v, false) THEN RETURN true; END IF;
  EXCEPTION WHEN undefined_function OR undefined_object OR invalid_text_representation THEN NULL;
  END;

  BEGIN
    EXECUTE 'SELECT coalesce(p.is_admin, false) FROM public.profiles p WHERE p.id = auth.uid()' INTO v;
    IF coalesce(v, false) THEN RETURN true; END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    EXECUTE 'SELECT public._is_super_admin()' INTO v;
    IF coalesce(v, false) THEN RETURN true; END IF;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public._media_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._media_is_admin() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) KHO GIF / STICKER / ICON DÙNG CHUNG  →  public.gif_library
--    Admin upload lên Cloudinary, mọi trang trong website đọc dùng chung.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_access_level') THEN
    CREATE TYPE public.media_access_level AS ENUM ('public', 'vip', 'admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.gif_library (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url          text NOT NULL,
  kind         text NOT NULL DEFAULT 'gif' CHECK (kind IN ('gif','sticker','icon')),
  label        text NOT NULL DEFAULT '',
  keywords     text[] NOT NULL DEFAULT '{}',
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Cột mở rộng (bảng cũ có thể chưa có)
ALTER TABLE public.gif_library
  ADD COLUMN IF NOT EXISTS folder_name  text,
  ADD COLUMN IF NOT EXISTS access_level public.media_access_level NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS sort_order   int;

CREATE INDEX IF NOT EXISTS gif_library_kind_created_idx ON public.gif_library (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS gif_library_folder_idx       ON public.gif_library (folder_name);
CREATE INDEX IF NOT EXISTS gif_library_access_idx       ON public.gif_library (access_level);

GRANT SELECT ON public.gif_library TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gif_library TO authenticated;
GRANT ALL ON public.gif_library TO service_role;

ALTER TABLE public.gif_library ENABLE ROW LEVEL SECURITY;

-- Đọc: cả website (lọc quyền public/vip/admin thực hiện ở tầng UI).
DROP POLICY IF EXISTS "gif_library read all"  ON public.gif_library;
DROP POLICY IF EXISTS gif_library_read        ON public.gif_library;
CREATE POLICY gif_library_read ON public.gif_library
  FOR SELECT TO anon, authenticated USING (true);

-- Ghi: chỉ Admin.
DROP POLICY IF EXISTS "gif_library admin write" ON public.gif_library;
DROP POLICY IF EXISTS gif_library_admin_write   ON public.gif_library;
CREATE POLICY gif_library_admin_write ON public.gif_library
  FOR ALL TO authenticated
  USING (public._media_is_admin())
  WITH CHECK (public._media_is_admin());

-- ---------------------------------------------------------------------------
-- 2) KHO ICON VIP (chỉ dùng trong Admin Panel)  →  public.vip_icons
--    + thư mục public.vip_icon_folders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vip_icon_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vip_icon_folders TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_icon_folders TO authenticated;
GRANT ALL ON public.vip_icon_folders TO service_role;

ALTER TABLE public.vip_icon_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_icon_folders_read ON public.vip_icon_folders;
CREATE POLICY vip_icon_folders_read ON public.vip_icon_folders
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS vip_icon_folders_write ON public.vip_icon_folders;
CREATE POLICY vip_icon_folders_write ON public.vip_icon_folders
  FOR ALL TO authenticated
  USING (public._media_is_admin()) WITH CHECK (public._media_is_admin());

INSERT INTO public.vip_icon_folders (name) VALUES
  ('Mặc định'), ('Telegram'), ('Anime'), ('Neon'), ('VIP'),
  ('Crown'), ('Event'), ('Tết'), ('Halloween'), ('Noel')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vip_icons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL DEFAULT '',
  url          text NOT NULL,
  storage_path text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Cột mở rộng: thư mục, thống kê, metadata Cloudinary, cờ độc quyền Admin.
ALTER TABLE public.vip_icons
  ADD COLUMN IF NOT EXISTS folder        text NOT NULL DEFAULT 'Mặc định',
  ADD COLUMN IF NOT EXISTS use_count     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_admin_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_id     text,
  ADD COLUMN IF NOT EXISTS secure_url    text,
  ADD COLUMN IF NOT EXISTS bytes         bigint,
  ADD COLUMN IF NOT EXISTS width         int,
  ADD COLUMN IF NOT EXISTS height        int,
  ADD COLUMN IF NOT EXISTS cloud_folder  text;

CREATE INDEX IF NOT EXISTS vip_icons_folder_idx    ON public.vip_icons (folder, created_at DESC);
CREATE INDEX IF NOT EXISTS vip_icons_use_count_idx ON public.vip_icons (use_count DESC);

GRANT SELECT ON public.vip_icons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_icons TO authenticated;
GRANT ALL ON public.vip_icons TO service_role;

ALTER TABLE public.vip_icons ENABLE ROW LEVEL SECURITY;

-- Đọc: cần cho việc hiển thị icon VIP sau tên ở ngoài trang.
DROP POLICY IF EXISTS vip_icons_read ON public.vip_icons;
CREATE POLICY vip_icons_read ON public.vip_icons
  FOR SELECT TO anon, authenticated USING (true);

-- Ghi (upload / sửa / xoá): chỉ Admin Panel.
DROP POLICY IF EXISTS vip_icons_write       ON public.vip_icons;
DROP POLICY IF EXISTS vip_icons_admin_write ON public.vip_icons;
CREATE POLICY vip_icons_admin_write ON public.vip_icons
  FOR ALL TO authenticated
  USING (public._media_is_admin()) WITH CHECK (public._media_is_admin());

-- ---------------------------------------------------------------------------
-- 3) Đếm số lần dùng icon VIP (danh sách "Icon HOT")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vip_icons_bump_use(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;
  UPDATE public.vip_icons i
     SET use_count = coalesce(i.use_count, 0) + 1
   WHERE i.id = ANY(p_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.vip_icons_bump_use(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vip_icons_bump_use(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) KIỂM TRA SAU KHI CHẠY
--    SELECT public._media_is_admin();            -- true khi đang là admin
--    SELECT count(*) FROM public.gif_library;
--    SELECT count(*) FROM public.vip_icons;
--    SELECT count(*) FROM public.vip_icon_folders;
-- ---------------------------------------------------------------------------
