-- ============================================================
-- SUPABASE #1 (Database CHÍNH) — DỌN DẸP Live Móc 🦋 + Cộng Đồng VIP
--
-- Hai tính năng này đã chuyển hoàn toàn sang Supabase #2.
-- File này CHỈ xóa các đối tượng thuộc hai tính năng đó khỏi Database #1.
--
-- KHÔNG đụng tới: users, profiles, posts, comments, messages, follows,
-- notifications hay bất kỳ bảng chính nào khác.
--
-- Cách chạy: SQL Editor của Supabase #1 → dán → Run.
-- Chạy lại nhiều lần được (idempotent).
-- ============================================================

begin;

-- 1) Triggers (nếu bảng còn tồn tại) -------------------------
drop trigger if exists set_live_moc_rooms_updated_at on public.live_moc_rooms;
drop trigger if exists set_live_moc_settings_updated_at on public.live_moc_settings;
drop trigger if exists set_community_page_updated_at on public.community_page;

-- 2) Policies (RLS) ------------------------------------------
drop policy if exists "live_moc_rooms_all" on public.live_moc_rooms;
drop policy if exists "live_moc_rooms_read" on public.live_moc_rooms;
drop policy if exists "live_moc_rooms_write" on public.live_moc_rooms;
drop policy if exists "live_moc_settings_all" on public.live_moc_settings;
drop policy if exists "live_moc_settings_read" on public.live_moc_settings;
drop policy if exists "live_moc_settings_write" on public.live_moc_settings;
drop policy if exists "community_page_all" on public.community_page;
drop policy if exists "community_page_read" on public.community_page;
drop policy if exists "community_page_write" on public.community_page;

-- 3) Views ----------------------------------------------------
drop view if exists public.live_moc_rooms_public cascade;
drop view if exists public.community_page_public cascade;

-- 4) Indexes --------------------------------------------------
drop index if exists public.live_moc_rooms_order_idx;
drop index if exists public.live_moc_rooms_visible_idx;

-- 5) Functions / RPC -----------------------------------------
drop function if exists public.get_live_moc_rooms() cascade;
drop function if exists public.get_live_moc_settings() cascade;
drop function if exists public.upsert_live_moc_room(jsonb) cascade;
drop function if exists public.delete_live_moc_room(uuid) cascade;
drop function if exists public.get_community_page() cascade;
drop function if exists public.upsert_community_page(jsonb) cascade;
drop function if exists public.touch_live_moc_updated_at() cascade;

-- 6) Tables (chỉ 3 bảng của Live Móc & Cộng Đồng VIP) ---------
drop table if exists public.live_moc_rooms cascade;
drop table if exists public.live_moc_settings cascade;
drop table if exists public.community_page cascade;

commit;

-- 7) Storage bucket (nếu trước đây có bucket riêng cho Live Móc)
--    Bỏ comment 2 lệnh dưới nếu bucket 'live-moc' tồn tại ở DB #1.
-- delete from storage.objects where bucket_id = 'live-moc';
-- delete from storage.buckets where id = 'live-moc';

-- 8) Kiểm tra sau khi chạy: 3 truy vấn dưới phải trả về 0 dòng.
-- select table_name from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('live_moc_rooms','live_moc_settings','community_page');
-- select routine_name from information_schema.routines
--   where routine_schema = 'public' and routine_name ilike '%live_moc%';
-- select routine_name from information_schema.routines
--   where routine_schema = 'public' and routine_name ilike '%community_page%';
