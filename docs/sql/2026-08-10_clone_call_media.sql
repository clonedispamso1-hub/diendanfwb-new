-- ============================================================
-- CALL V1 — media mô phỏng cuộc gọi cho Nick Clone (Tài khoản thứ hai).
-- Chỉ thêm 2 cột URL vào profiles; không đổi RLS / Auth / Realtime.
-- ============================================================

alter table public.profiles
  add column if not exists call_video_url text,
  add column if not exists call_voice_url text;
