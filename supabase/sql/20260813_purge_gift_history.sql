-- Xóa toàn bộ lịch sử quà tặng (chỉ bảng post_gifts).
-- KHÔNG động tới số dư xu, ngọc rồng, giao dịch hay bất kỳ bảng nào khác.
-- Chỉ Bang Chủ (admin) đang đăng nhập mới được gọi.

create or replace function public.admin_purge_gift_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_active_bangchu(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_count from public.post_gifts;
  delete from public.post_gifts;
  return v_count;
end;
$$;

revoke all on function public.admin_purge_gift_history() from public, anon;
grant execute on function public.admin_purge_gift_history() to authenticated;
