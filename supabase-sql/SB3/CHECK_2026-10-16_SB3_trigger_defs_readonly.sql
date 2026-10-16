-- CHỈ ĐỌC — chạy TRƯỚC file FIX_2026-10-16 để xác nhận bản trigger đang chạy.
-- 1) Nội dung hàm trigger hiện tại (tìm chữ 'internal' để biết là bản 17/10 hay 16/10).
select pg_get_functiondef('private.enforce_post_ticket()'::regprocedure);
select pg_get_functiondef('private.lock_post_charge_id()'::regprocedure);
-- 2) Hàm has_role mà trigger gọi cho vé exempt.
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='has_role';
-- 3) Cột post_charge_id và số bài đã có charge (sẽ được ghi vào sổ).
select data_type from information_schema.columns
 where table_schema='public' and table_name='posts' and column_name='post_charge_id';
select count(*) as bai_co_charge, count(distinct post_charge_id) as charge_khac_nhau
  from public.posts where post_charge_id is not null;
