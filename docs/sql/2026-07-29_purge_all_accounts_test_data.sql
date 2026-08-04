-- ============================================================
-- DỌN DỮ LIỆU TEST: xóa toàn bộ tài khoản (KHÔNG blacklist)
-- Chạy trong SQL Editor của Supabase.
-- KHÔNG xóa table / schema / RPC / migration — chỉ xóa DỮ LIỆU.
-- ============================================================

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
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'forbidden';
  end if;
  if _confirm is distinct from 'XOALUONDI'
     or _admin_password is distinct from 'PASSADMIN'
     or _admin_code is distinct from '792006' then
    raise exception 'confirmation_required';
  end if;

  -- 1) Nội dung + quan hệ (bảng nào không tồn tại thì bỏ qua)
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
        null; -- bỏ qua bảng lỗi, không chặn toàn bộ quá trình dọn dữ liệu
      end;
    end if;
  end loop;

  -- 2) Xóa tài khoản auth để SĐT có thể đăng ký lại
  begin
    delete from auth.users where true;
  exception when others then
    null;
  end;

  return n;
end;
$$;

grant execute on function public.admin_purge_all_accounts(text, text, text) to authenticated;
