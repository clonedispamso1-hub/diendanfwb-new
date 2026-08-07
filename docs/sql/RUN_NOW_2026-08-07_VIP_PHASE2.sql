-- ============================================================
-- PHASE 2 — ICON VIP / GIF VIP: THƯ MỤC + FIX UPLOAD + THỐNG KÊ
-- Chạy 1 lần trong Supabase SQL Editor (project hiện tại — KHÔNG đổi URL/key).
-- An toàn để chạy lại nhiều lần (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 0) FIX QUYỀN ADMIN (nguyên nhân upload icon/GIF không insert được)
--    Bản cũ gọi public._is_super_admin() — nếu hàm đó không tồn tại,
--    RLS báo lỗi và INSERT vào vip_icons bị chặn dù file đã lên storage.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vip_is_admin()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT coalesce(p.is_admin, false) INTO v FROM public.profiles p WHERE p.id = auth.uid();
  IF coalesce(v, false) THEN RETURN true; END IF;

  -- Bang Chủ (bảng bangchu) nếu có
  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.bangchu b
               WHERE b.auth_user_id = auth.uid() AND b.is_active
                 AND b.status = ''approved'')'
      INTO v;
    IF coalesce(v, false) THEN RETURN true; END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Hàm super admin cũ nếu có
  BEGIN
    EXECUTE 'SELECT public._is_super_admin()' INTO v;
    IF coalesce(v, false) THEN RETURN true; END IF;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public._vip_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._vip_is_admin() TO authenticated, anon;

-- ------------------------------------------------------------
-- 1) THƯ MỤC ICON VIP
-- ------------------------------------------------------------
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
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

INSERT INTO public.vip_icon_folders (name) VALUES
  ('Mặc định'), ('Telegram'), ('Anime'), ('Neon'), ('VIP'),
  ('Crown'), ('Event'), ('Tết'), ('Halloween'), ('Noel')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 2) CỘT MỚI: folder cho icon, thống kê use_count cho icon + GIF
-- ------------------------------------------------------------
ALTER TABLE public.vip_icons
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'Mặc định',
  ADD COLUMN IF NOT EXISTS use_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS vip_icons_folder_idx ON public.vip_icons (folder, created_at DESC);

ALTER TABLE public.vip_gifs
  ADD COLUMN IF NOT EXISTS use_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS vip_gifs_use_count_idx ON public.vip_gifs (use_count DESC);

-- Thư mục GIF gợi ý
INSERT INTO public.vip_gif_folders (name) VALUES
  ('Mặc định'), ('Love'), ('Cute'), ('Neon'), ('Gaming'),
  ('Food'), ('Anime'), ('Emoji'), ('Sticker'), ('Telegram Premium')
ON CONFLICT (name) DO NOTHING;

-- Clone (tài khoản thứ hai) cần đọc thư mục GIF để random khi tạo
DROP POLICY IF EXISTS vip_gif_folders_read ON public.vip_gif_folders;
CREATE POLICY vip_gif_folders_read ON public.vip_gif_folders
  FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- 2b) RLS BẢNG vip_icons / vip_gifs (FIX: storage ok nhưng DB không insert)
-- ------------------------------------------------------------
ALTER TABLE public.vip_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_gifs  ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.vip_icons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_icons TO authenticated;
GRANT ALL ON public.vip_icons TO service_role;

GRANT SELECT ON public.vip_gifs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vip_gifs TO authenticated;
GRANT ALL ON public.vip_gifs TO service_role;

DROP POLICY IF EXISTS vip_icons_read ON public.vip_icons;
CREATE POLICY vip_icons_read ON public.vip_icons
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS vip_icons_admin_write ON public.vip_icons;
CREATE POLICY vip_icons_admin_write ON public.vip_icons
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

DROP POLICY IF EXISTS vip_gifs_read ON public.vip_gifs;
CREATE POLICY vip_gifs_read ON public.vip_gifs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS vip_gifs_admin_write ON public.vip_gifs;
CREATE POLICY vip_gifs_admin_write ON public.vip_gifs
  FOR ALL TO authenticated
  USING (public._vip_is_admin()) WITH CHECK (public._vip_is_admin());

-- ------------------------------------------------------------
-- 3) ĐẾM SỐ LẦN DÙNG GIF (cho danh sách "GIF HOT")
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vip_gifs_bump_use(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;
  UPDATE public.vip_gifs g
     SET use_count = coalesce(g.use_count, 0) + 1
   WHERE g.id = ANY(p_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.vip_gifs_bump_use(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vip_gifs_bump_use(uuid[]) TO authenticated;

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

-- ------------------------------------------------------------
-- 4) STORAGE: đảm bảo bucket public + policy ghi cho admin
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

-- ------------------------------------------------------------
-- 5) KIỂM TRA NHANH SAU KHI CHẠY
--    SELECT public._vip_is_admin();          -- phải trả về true khi đang đăng nhập admin
--    SELECT count(*) FROM public.vip_icons;  -- sau khi upload phải > 0
-- ------------------------------------------------------------
