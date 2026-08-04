-- ============================================================
-- SUPABASE #2 — Bật Realtime cho bảng live_moc_rooms
-- Dùng cho popup "🔴 Phòng Live mới" gửi tới mọi người dùng đang online.
-- Chạy trên SQL Editor của Supabase #2. An toàn khi chạy lại nhiều lần.
-- ============================================================

alter table public.live_moc_rooms replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.live_moc_rooms;
  exception
    when duplicate_object then null;
  end;
end $$;
