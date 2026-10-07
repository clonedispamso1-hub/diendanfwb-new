-- ============================================================
-- CHỈ CHẠY SAU KHI ĐÃ TEST ỔN bảng simulated_post_likes.
-- Xoá cấu hình Tym mô phỏng kiểu cũ (1 ô JSON trong admin_site_settings).
-- Không đụng bài viết, bảng likes, tài khoản.
-- ============================================================
delete from public.admin_site_settings where key = 'sim_likes_config';
