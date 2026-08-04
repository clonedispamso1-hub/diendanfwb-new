-- ============================================================
-- SUPABASE #2 — Live Móc 🦋: đảm bảo mốc bắt đầu Live luôn tồn tại.
-- Chạy trên SQL Editor của Supabase #2 (VITE_MEDIA_SUPABASE_URL).
-- Bộ đếm 👁 ❤️ 💬 được tính từ started_at nên cột này KHÔNG được rỗng.
-- ============================================================
alter table public.live_moc_rooms
  add column if not exists started_at timestamptz;

update public.live_moc_rooms
   set started_at = coalesce(created_at, now())
 where started_at is null;

alter table public.live_moc_rooms
  alter column started_at set default now();
