-- ============================================================================
-- DỌN DỮ LIỆU TEST — SUPABASE #3 (posts, comments, likes, chat, notifications,
-- logs, stats). Chạy trong SQL Editor của project SB3 (uaqsetfdciyzxpuhulux).
--
-- Toàn bộ bài viết / bình luận / tin nhắn / thông báo / quà / story hiện có
-- đều là dữ liệu TEST → xoá sạch. KHÔNG drop table/RPC/trigger/function.
-- ============================================================================

begin;

do $$
declare
  t text;
  tables text[] := array[
    -- Feed
    'post_reports','comment_likes','comment_reports','post_likes','likes',
    'comments','post_views','post_media','posts',
    'videos_social','video_gifts','stories','story_views','story_reactions',
    -- Chat
    'message_reactions','message_gifts','messages','group_messages',
    'chat_group_messages','virtual_chat_messages','conversation_clears',
    'chat_partners','conversations','red_packets','red_packet_claims',
    -- Quà / gem log
    'gifts','gift_history','gem_history','candy_logs','dice_logs',
    -- Thông báo & hoạt động
    'notifications','nearby_match_notifications','activity_logs',
    'member_activity_log','agent_activity_logs','keyword_logs',
    'bot_actions_logs','bot_activity_queue','moderation_queue',
    'engagement_events','engagement_points_log','profile_views',
    'profile_views_today','rate_limit_hits','spam_detection_logs',
    'group_stats_log','group_leave_log','connect_scan_usage',
    'security_events','risk_scores','system_health_logs','admin_logs',
    -- Quan hệ
    'follows','user_blocks','user_locations','daily_follow_stats',
    'leaderboard_daily'
  ];
begin
  -- 2 vòng để dọn hết các bảng vướng khoá ngoại
  for i in 1..2 loop
    foreach t in array tables loop
      if exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=t and table_type='BASE TABLE') then
        begin
          execute format('delete from public.%I where true', t);
        exception when others then null;
        end;
      end if;
    end loop;
  end loop;
end $$;

commit;

-- KIỂM TRA: mọi bảng nội dung phải = 0 dòng
select 'posts' as t, (select count(*) from public.posts) as n
union all select 'comments', (select count(*) from public.comments)
union all select 'messages', (select count(*) from public.messages)
union all select 'notifications', (select count(*) from public.notifications);
