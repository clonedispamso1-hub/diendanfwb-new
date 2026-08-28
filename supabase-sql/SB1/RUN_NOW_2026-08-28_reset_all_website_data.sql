-- ============================================================
-- RESET DỮ LIỆU WEBSITE (nút "Thành Công" trong Admin Panel)
-- Chỉ XOÁ DỮ LIỆU — KHÔNG drop bảng / schema / RPC / trigger.
-- Chạy trong SQL Editor của Supabase #1.
-- ============================================================
create or replace function public.reset_all_website_data()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  n int := 0;
  tables text[] := array[
    'post_reports','comment_likes','comment_reports','post_likes','likes',
    'comments','post_views','post_media','posts','stories','story_views',
    'message_reactions','messages','conversations','conversation_clears',
    'notifications','activity_logs','admin_logs','reports','user_reports',
    'feedbacks','gifts','gift_history','gem_transactions','gem_history',
    'coin_transfers','withdrawal_requests','follows','user_blocks',
    'user_locations','daily_follow_stats','leaderboard_daily',
    'second_accounts','phone_verifications','profiles'
  ];
begin
  -- 2 vòng để dọn hết các bảng vướng khoá ngoại
  for i in 1..2 loop
    foreach t in array tables loop
      if exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = t and table_type = 'BASE TABLE'
      ) then
        begin
          execute format('delete from public.%I where true', t);
          get diagnostics n = row_count;
        exception when others then null;
        end;
      end if;
    end loop;
  end loop;

  -- Xoá tài khoản auth để số điện thoại / email có thể đăng ký lại ngay
  begin
    delete from auth.users where true;
  exception when others then null;
  end;

  return n;
end;
$$;

grant execute on function public.reset_all_website_data() to authenticated;
