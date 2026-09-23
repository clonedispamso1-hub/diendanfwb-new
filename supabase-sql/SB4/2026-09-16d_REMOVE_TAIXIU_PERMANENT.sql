-- =====================================================================
-- XÓA VĨNH VIỄN GAME TÀI XỈU KHỎI SUPABASE #4
-- Project: ybzdpxwbpbkeqkqwbscp
-- Chạy TOÀN BỘ file này trong SQL Editor của Supabase #4.
-- Idempotent — chạy lại nhiều lần đều an toàn.
--
-- ⚠️ CHỈ tác động tới các thành phần Tài Xỉu đã audit:
--    taixiu_settings, taixiu_assets, index, 7 policy bảng,
--    4 storage policy, objects trong bucket `taixiu-assets`, bucket đó.
--    KHÔNG đụng tới bảng / bucket / policy / function nào khác.
--
-- Thứ tự: settings → assets → storage policies → storage objects → bucket
-- =====================================================================

begin;

-- ------------------------------------------------------------------
-- 1) public.taixiu_settings (xóa trước vì có FK tới taixiu_assets)
-- ------------------------------------------------------------------
drop policy if exists "taixiu settings read"   on public.taixiu_settings;
drop policy if exists "taixiu settings insert" on public.taixiu_settings;
drop policy if exists "taixiu settings update" on public.taixiu_settings;

drop table if exists public.taixiu_settings cascade;

-- ------------------------------------------------------------------
-- 2) public.taixiu_assets + 3) index + 4) 4 policy còn lại
-- ------------------------------------------------------------------
drop policy if exists "taixiu assets read"   on public.taixiu_assets;
drop policy if exists "taixiu assets insert" on public.taixiu_assets;
drop policy if exists "taixiu assets update" on public.taixiu_assets;
drop policy if exists "taixiu assets delete" on public.taixiu_assets;

drop index if exists public.taixiu_assets_active_idx;

drop table if exists public.taixiu_assets cascade;

-- ------------------------------------------------------------------
-- 5) 4 storage policies của bucket taixiu-assets (trên storage.objects)
--    Chỉ 4 policy có tên chính xác dưới đây bị xóa.
-- ------------------------------------------------------------------
drop policy if exists "taixiu assets storage read"   on storage.objects;
drop policy if exists "taixiu assets storage insert" on storage.objects;
drop policy if exists "taixiu assets storage update" on storage.objects;
drop policy if exists "taixiu assets storage delete" on storage.objects;

-- ------------------------------------------------------------------
-- 6) Xóa toàn bộ objects trong bucket taixiu-assets
--    (chỉ rows có bucket_id = 'taixiu-assets')
-- ------------------------------------------------------------------
delete from storage.objects where bucket_id = 'taixiu-assets';

-- ------------------------------------------------------------------
-- 7) Xóa bucket taixiu-assets
-- ------------------------------------------------------------------
delete from storage.buckets where id = 'taixiu-assets';

commit;

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY — cả 4 truy vấn phải trả về 0 dòng
-- =====================================================================
select tablename from pg_tables
where schemaname = 'public' and tablename like 'taixiu%';

select policyname, tablename from pg_policies
where policyname ilike 'taixiu%';

select id from storage.buckets where id = 'taixiu-assets';

select count(*) as leftover_objects from storage.objects
where bucket_id = 'taixiu-assets';
