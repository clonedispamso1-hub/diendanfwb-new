-- ============================================================
-- Tym mô phỏng — bỏ giới hạn target 1000/2000/3000/4000/5000.
-- CHẠY THỦ CÔNG trên Supabase #1 (cùng DB với simulated_post_likes).
-- Idempotent: chạy lại an toàn. Không đụng dữ liệu, không đụng bảng khác.
-- Sau khi chạy: target chỉ cần >= 1, không giới hạn trên.
-- ============================================================

alter table public.simulated_post_likes
  drop constraint if exists simulated_post_likes_target_check;

alter table public.simulated_post_likes
  add constraint simulated_post_likes_target_check check (target >= 1);

-- final_count cũng không còn giới hạn 5000 (phải >= target bất kỳ):
alter table public.simulated_post_likes
  drop constraint if exists simulated_post_likes_final_count_check;

alter table public.simulated_post_likes
  add constraint simulated_post_likes_final_count_check
  check (final_count is null or final_count >= 0);

-- Kiểm tra sau khi chạy:
-- insert thử 10001 (với user admin) phải lưu được, không còn lỗi check constraint.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.simulated_post_likes'::regclass;
