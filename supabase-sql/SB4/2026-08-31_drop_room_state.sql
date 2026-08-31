-- Gỡ bỏ hoàn toàn cấu hình "Phòng Chat Kín" khỏi bảng bait_groups (Supabase #4).
alter table public.bait_groups
  drop column if exists online_count,
  drop column if exists is_open;
