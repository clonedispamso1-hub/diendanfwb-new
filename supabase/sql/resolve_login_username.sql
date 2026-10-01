-- Tra cứu tên đăng nhập từ SĐT (hoặc username) cho flow login.
-- Chỉ trả về username (đã là dữ liệu công khai). Không trả phone/email/hồ sơ.
create or replace function public.resolve_login_username(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.username
  from public.profiles p
  where p_identifier ~ '^0[0-9]{9}$'
    and (p.phone = p_identifier or p.username = p_identifier)
    and p.username is not null
  order by (p.phone = p_identifier) desc
  limit 1
$$;

revoke all on function public.resolve_login_username(text) from public;
grant execute on function public.resolve_login_username(text) to anon, authenticated;
