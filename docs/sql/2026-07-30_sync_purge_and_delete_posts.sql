-- ============================================================
-- ĐỒNG BỘ RPC với Frontend cho 2 luồng dọn dữ liệu TEST.
-- 1) admin_purge_all_accounts: xác thực mật khẩu Admin HIỆN TẠI
--    (kiểm tra trực tiếp auth.users.encrypted_password bằng pgcrypto),
--    không còn hardcode 'PASSADMIN'. Vẫn giữ mã 'XOALUONDI' + '792006'.
-- 2) admin_delete_all_posts: đổi mật mã từ 'DELETE ALL POSTS' sang
--    'XOAHETDI' để khớp với UI mới.
-- KHÔNG xoá table / schema / migration. KHÔNG blacklist SĐT/IP/thiết bị.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.admin_purge_all_accounts(
  _confirm text,
  _admin_password text,
  _admin_code text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  t record;
  uid uuid := auth.uid();
  ok_pw boolean := false;
begin
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'forbidden';
  end if;

  if _confirm is distinct from 'XOALUONDI'
     or _admin_code is distinct from '792006' then
    raise exception 'confirmation_required';
  end if;

  -- Xác thực mật khẩu Admin HIỆN TẠI (đăng ký trong Supabase Auth).
  select (u.encrypted_password = crypt(coalesce(_admin_password,''), u.encrypted_password))
    into ok_pw
    from auth.users u
   where u.id = uid;

  if not coalesce(ok_pw, false) then
    raise exception 'invalid_password';
  end if;

  -- 1) Nội dung + quan hệ (bảng không tồn tại thì bỏ qua)
  for t in
    select unnest(array[
      'likes','comment_likes','comments','post_reports','user_reports','reports',
      'message_reactions','messages','conversation_clears','conversations',
      'follows','user_blocks','notifications','activity_logs','gem_history',
      'gifts','video_gifts','red_packets','red_packet_claims','stories',
      'videos_social','posts','user_locations','user_restrictions',
      'daily_follow_stats','leaderboard_daily','device_fingerprints',
      'phone_blacklist','ip_blacklist','banned_devices','login_attempts',
      'phone_verifications','profiles'
    ]) as name
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t.name and table_type = 'BASE TABLE'
    ) then
      begin
        if t.name = 'profiles' then
          execute 'delete from public.profiles where true';
          get diagnostics n = row_count;
        else
          execute format('delete from public.%I where true', t.name);
        end if;
      exception when others then
        null;
      end;
    end if;
  end loop;

  -- 2) Xoá tài khoản auth để SĐT có thể đăng ký lại
  begin
    delete from auth.users where true;
  exception when others then
    null;
  end;

  return n;
end;
$$;

grant execute on function public.admin_purge_all_accounts(text, text, text) to authenticated;

-- ============================================================
-- Đổi mật mã xoá toàn bộ bài viết: 'XOAHETDI'
-- ============================================================
create or replace function public.admin_delete_all_posts(_confirm text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'forbidden';
  end if;
  if _confirm is distinct from 'XOAHETDI' then
    raise exception 'confirmation_required';
  end if;

  delete from public.likes where true;
  delete from public.comments where true;
  delete from public.posts where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_delete_all_posts(text) to authenticated;
