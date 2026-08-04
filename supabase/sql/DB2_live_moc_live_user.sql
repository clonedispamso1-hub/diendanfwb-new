-- ============================================================
-- SUPABASE #2 — Live Móc 🦋: gắn "Tài khoản đang Live" vào phòng
-- Chạy trên SQL Editor của Supabase #2 (VITE_MEDIA_SUPABASE_URL).
-- ============================================================
alter table public.live_moc_rooms
  add column if not exists live_user_id uuid;

create index if not exists live_moc_rooms_live_user_idx
  on public.live_moc_rooms (live_user_id);
