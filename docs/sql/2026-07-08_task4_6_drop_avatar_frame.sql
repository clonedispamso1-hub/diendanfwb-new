-- Task #4.6: Gỡ bỏ hoàn toàn Avatar Frame — chuyển sang hiệu ứng Glow phía UI.
-- Chạy trực tiếp trên Supabase SQL Editor (DB cũ zbuwddjcqdlyijcunwgd).
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS avatar_frame;
