-- ⚠️ CHƯA CHẠY — chờ duyệt của admin trước khi chạy trong SQL Editor (Supabase #1).
-- Mục đích: tạo RPC admin_reset_password (hiện chưa tồn tại) cho nút "Reset mật khẩu".
-- Không tạo bảng mới, không đổi schema dữ liệu.

create or replace function public.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'password_too_short';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;
end;
$$;

revoke all on function public.admin_reset_password(uuid, text) from public, anon;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
