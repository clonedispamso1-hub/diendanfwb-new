-- Gỡ vĩnh viễn hệ thống VIP Zalo cũ (Supabase #4). Thứ tự: bảng con trước, bảng cha sau.
-- GIỮ NGUYÊN: zalo_media_library, zalo_float_icon, zalo_bait_groups, seed_account_groups, bait_groups, bait_group_folders.
BEGIN;
DROP TABLE IF EXISTS public.zalo_area_groups;
DROP TABLE IF EXISTS public.zalo_user_areas;
DROP TABLE IF EXISTS public.zalo_sub_items_l2;
DROP TABLE IF EXISTS public.zalo_sub_items_l1;
DROP TABLE IF EXISTS public.zalo_country_cards;
COMMIT;
