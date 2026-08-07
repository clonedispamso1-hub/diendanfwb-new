-- HỆ THỐNG 2 — Media VIP gắn sau tên (Admin Panel / Clone)
-- Chạy 1 lần trong Supabase SQL Editor của project đang dùng.
--
-- Cột `vip_media` là MẢNG URL Cloudinary (không giới hạn số lượng media/clone).
-- Kho GIF dùng chung (bảng gif_library) KHÔNG liên quan tới cột này.

alter table public.profiles
  add column if not exists vip_media jsonb not null default '[]'::jsonb;

comment on column public.profiles.vip_media is
  'Danh sách URL Icon/GIF VIP hiển thị ngay sát tên (hệ thống VIP, tách biệt gif_library).';

-- Backfill từ cột cũ (chỉ 1 GIF) sang mảng mới.
update public.profiles
   set vip_media = jsonb_build_array(title_gif_url)
 where coalesce(title_gif_url, '') <> ''
   and (vip_media is null or vip_media = '[]'::jsonb);

-- Ai cũng đọc được để hiển thị icon sau tên; chỉ admin/chủ hồ sơ được ghi
-- (giữ nguyên các policy UPDATE hiện có của bảng profiles).
grant select on public.profiles to anon, authenticated;
