-- =====================================================================
-- CHẠY TRÊN SUPABASE 3 (uaqsetfdciyzxpuhulux). An toàn chạy lại nhiều lần.
-- Khôi phục ĐÚNG 2 thành phần bị thiếu, lấy nguyên văn từ
-- RUN_NOW_2026-10-16_SB3_post_ticket_hardening.sql (dòng 17-27 và 29-45):
--   1) bảng private.used_post_charges (+ ghi lại lượt đã dùng của bài cũ)
--   2) hàm  private.post_ticket_trusted_caller()
-- KHÔNG đụng: trigger, enforce_post_ticket, lock_post_charge_id, khoá ký,
-- policy, dữ liệu bài viết. Không xoá gì. Chạy trong 1 transaction.
-- =====================================================================
begin;

-- Bước 0: dừng ngay nếu thiếu những thứ có sẵn mà phần dưới cần.
do $$
begin
  if to_regnamespace('private') is null then
    raise exception 'Thiếu schema private — dừng, không sửa gì.';
  end if;
  if to_regclass('public.posts') is null then
    raise exception 'Thiếu bảng public.posts — dừng.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='posts'
                    and column_name='post_charge_id' and data_type='uuid') then
    raise exception 'posts.post_charge_id (uuid) không có — dừng.';
  end if;
end $$;

-- 1) Sổ lượt đã dùng: mỗi charge_id chỉ dùng 1 lần (khoá chính chặn
--    2 request song song và chặn dùng lại sau khi xoá bài).
create table if not exists private.used_post_charges (
  charge_id uuid primary key,
  post_id uuid,
  used_at timestamptz not null default now()
);
revoke all on private.used_post_charges from public, anon, authenticated;

-- Ghi các lượt đã gắn vào bài hiện có (CHỈ ĐỌC posts, không sửa bài).
insert into private.used_post_charges(charge_id, post_id)
select post_charge_id, id from public.posts where post_charge_id is not null
on conflict (charge_id) do nothing;

-- 2) Hàm xác định "người gọi tin cậy" (giữ nguyên bản gốc).
create or replace function private.post_ticket_trusted_caller()
returns boolean language plpgsql stable as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role text;
begin
  v_role := coalesce(v_claims::jsonb->>'role', nullif(current_setting('request.jwt.claim.role', true), ''));
  if v_role = 'service_role' then
    return true;
  end if;
  if v_role is null and session_user in ('postgres', 'supabase_admin') then
    return true;
  end if;
  return false;
end; $$;
revoke all on function private.post_ticket_trusted_caller() from public, anon, authenticated;

commit;

-- Kiểm tra sau khi chạy (chỉ đọc): cả 2 dòng phải = true.
select 'used_post_charges' as thanh_phan, to_regclass('private.used_post_charges') is not null as co_mat
union all
select 'post_ticket_trusted_caller', exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='private' and p.proname='post_ticket_trusted_caller');
select count(*) as so_luot_da_ghi from private.used_post_charges;
