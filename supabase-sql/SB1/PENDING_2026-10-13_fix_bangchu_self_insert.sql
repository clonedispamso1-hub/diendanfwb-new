-- =====================================================================
-- SUPABASE #1 — Vá lỗ hổng tự cấp quyền admin qua bảng bangchu. CHƯA CHẠY.
-- Policy bangchu_self_insert chỉ kiểm tra auth_user_id = auth.uid() nên người
-- dùng có thể tự chèn role='admin_1', status='approved', is_active=true.
-- Trang /admin/register chỉ gửi (auth_user_id, username) → dùng giá trị mặc định
-- agent / pending / false, nên vẫn đăng ký được sau khi vá.
-- Kiểm tra trước: column_default của role/status/is_active phải là
-- 'agent' / 'pending' / false.
-- =====================================================================
begin;
drop policy if exists bangchu_self_insert on public.bangchu;
drop policy if exists "self register pending" on public.bangchu;
create policy "self register pending" on public.bangchu
  for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and role = 'agent'
    and status = 'pending'
    and is_active = false
  );
commit;

-- Rà soát dòng admin có thể đã tự cấp quyền (approved nhưng không ai duyệt):
--   select id, username, role, status, approved_by, approved_at, created_at
--   from public.bangchu where status = 'approved' and approved_by is null;
--
-- Khôi phục tạm nếu không ai đăng ký được (sẽ mở lại lỗ hổng):
--   create policy bangchu_self_insert on public.bangchu
--     for insert to authenticated with check (auth_user_id = auth.uid());
