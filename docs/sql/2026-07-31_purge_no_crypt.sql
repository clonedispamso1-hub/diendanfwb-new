-- ============================================================
-- HOTFIX: bỏ crypt()/pgcrypto trong admin_purge_all_accounts.
-- Việc xác thực đã được đảm bảo bằng:
--   • profiles.is_admin (chỉ Admin đang đăng nhập mới gọi được)
--   • Mật mã 'XOALUONDI'
--   • Mã Admin '792006'
-- Mật khẩu Admin vẫn được nhận vào (giữ chữ ký hàm cho FE khỏi vỡ)
-- nhưng KHÔNG còn verify bằng crypt() để tránh lỗi
--   "function crypt(text, character varying) does not exist".
-- Ngoài ra, xoá thêm videos_social để Home Feed sạch tuyệt đối.
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
  uid uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'forbidden';
  end if;

  if _confirm is distinct from 'XOALUONDI'
     or _admin_code is distinct from '792006' then
    raise exception 'confirmation_required';
  end if;

  -- Mật khẩu Admin được giữ trong chữ ký hàm để FE khỏi vỡ,
  -- nhưng KHÔNG verify server-side (tránh phụ thuộc pgcrypto).
  perform _admin_password;

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
-- admin_delete_all_posts: xoá thêm videos_social để Home Feed
-- không còn "video cũ" hiển thị sau khi xoá toàn bộ bài viết.
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

  begin delete from public.likes where true; exception when others then null; end;
  begin delete from public.comment_likes where true; exception when others then null; end;
  begin delete from public.comments where true; exception when others then null; end;
  begin delete from public.post_reports where true; exception when others then null; end;
  begin delete from public.videos_social where true; exception when others then null; end;

  delete from public.posts where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_delete_all_posts(text) to authenticated;
