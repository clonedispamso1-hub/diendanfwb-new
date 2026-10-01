-- Thêm 3 cột liên kết mạng xã hội còn thiếu trên bảng profiles.
-- profiles đã có: zalo, facebook. Thiếu: telegram, instagram, x.
-- Chạy trên Supabase #1 (core) — SQL Editor.
alter table public.profiles
  add column if not exists telegram  text,
  add column if not exists instagram text,
  add column if not exists x         text;
