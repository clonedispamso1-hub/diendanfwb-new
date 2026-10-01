-- =====================================================================
-- Khôi phục public.vip_icons_for_users — PHIÊN BẢN MATCH URL (2026-09-25)
-- Chạy trên Supabase #1 (SQL Editor). KHÔNG ALTER TABLE, KHÔNG đổi dữ liệu.
--
-- Schema hiện tại (không có profiles.vip_icon_id):
--   profiles.vip_media    jsonb      — mảng URL Cloudinary (mặc định '[]')
--   profiles.title_gif_url text      — GIF sau tên do Admin gán
--   profiles.profile_gif   text      — GIF hồ sơ (tài khoản thứ hai)
--   vip_icons.url         text NOT NULL
--   vip_icons.secure_url  text
--
-- Cách hoạt động: với mỗi profile, trả về các icon trong vip_icons (is_active)
-- mà url/secure_url của icon TRÙNG KHỚP CHÍNH XÁC với ít nhất một trong:
-- title_gif_url, profile_gif, hoặc một URL bất kỳ (mọi cấp lồng) trong vip_media.
-- Trả về cột url ưu tiên secure_url, fallback về url.
--
-- RPC này chỉ phục vụ useHasVipNameIcon / khung avatar VIP (VipIconBadge).
-- Không ảnh hưởng logic hiển thị GIF sau tên (CloneVipNameMedia đọc riêng
-- profiles.vip_media qua admin_site_settings, không đi qua function này).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.vip_icons_for_users(p_ids uuid[])
RETURNS TABLE (user_id uuid, icon_id uuid, name text, url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
         p.id,
         i.id,
         i.name,
         COALESCE(NULLIF(i.secure_url, ''), i.url) AS url
    FROM public.profiles p
    JOIN public.vip_icons i
      ON i.is_active
     AND (
           -- title_gif_url khớp url hoặc secure_url
           i.url        = p.title_gif_url
        OR i.secure_url = p.title_gif_url
           -- profile_gif khớp url hoặc secure_url
        OR i.url        = p.profile_gif
        OR i.secure_url = p.profile_gif
           -- một URL bất kỳ trong vip_media (jsonb, mọi cấp) khớp url/secure_url
        OR EXISTS (
             SELECT 1
               FROM jsonb_path_query(p.vip_media, 'lax $.**') AS m(v)
              WHERE jsonb_typeof(m.v) = 'string'
                AND m.v #>> '{}' IN (i.url, i.secure_url)
           )
         )
   WHERE p.id = ANY(p_ids);
$$;

-- Chỉ cho phép gọi, không cho sửa định nghĩa.
REVOKE ALL ON FUNCTION public.vip_icons_for_users(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vip_icons_for_users(uuid[]) TO anon, authenticated;

-- Làm mới cache schema của PostgREST sau khi tạo/đổi function.
NOTIFY pgrst, 'reload schema';
