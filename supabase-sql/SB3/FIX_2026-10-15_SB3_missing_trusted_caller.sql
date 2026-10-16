-- =====================================================================
-- CHẠY TRÊN SUPABASE 3 (uaqsetfdciyzxpuhulux). An toàn chạy lại.
-- Nguyên nhân: trigger kiểm tra vé đăng bài trên bảng posts đang gọi
-- private.post_ticket_trusted_caller() nhưng hàm này KHÔNG tồn tại
-- (lỗi 42883) → mọi lượt đăng bài đều bị database từ chối sau khi
-- Supabase 1 đã giữ lượt. File này CHỈ tạo lại hàm bị thiếu
-- (giống hệt bản trong RUN_NOW_2026-10-16_SB3_post_ticket_hardening.sql),
-- không sửa / xoá dữ liệu nào.
-- =====================================================================
create schema if not exists private;

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

-- Kiểm tra sau khi chạy: phải trả về 1 dòng.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'private' and proname = 'post_ticket_trusted_caller';
