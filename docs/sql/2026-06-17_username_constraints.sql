-- OKLOVE: ràng buộc username 4-15 ký tự, chỉ [A-Za-z0-9_]
-- Chạy trên DB cũ (Supabase project zbuwddjcqdlyijcunwgd) qua SQL Editor.

ALTER TABLE public.profiles
  ALTER COLUMN username TYPE varchar(15);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS username_length_check,
  ADD  CONSTRAINT username_length_check
       CHECK (char_length(username) >= 4 AND char_length(username) <= 15);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS username_format_check,
  ADD  CONSTRAINT username_format_check
       CHECK (username ~ '^[A-Za-z0-9_]+$');
