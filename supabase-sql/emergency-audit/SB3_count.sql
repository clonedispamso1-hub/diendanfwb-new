-- =====================================================================
-- SB3 (social / logs: posts, comments, messages, notifications) — AUDIT ĐẾM
-- CHỈ ĐỌC 100%: chỉ SELECT. Không INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP.
-- Chạy trong SQL Editor của Supabase #3.
-- =====================================================================

-- 1) ĐẾM TỪNG BẢNG ----------------------------------------------------
with wanted(table_name, category, note) as (
  values
    -- A. USER DATA
    ('posts',                   'USER',  'Bài viết'),
    ('post_media',              'USER',  'Ảnh/video bài viết'),
    ('post_views',              'USER',  'Lượt xem bài viết'),
    ('comments',                'USER',  'Bình luận'),
    ('comment_likes',           'USER',  'Thích bình luận'),
    ('likes',                   'USER',  'Thích bài viết'),
    ('post_likes',              'USER',  'Thích bài viết (bảng phụ)'),
    ('messages',                'USER',  'Tin nhắn'),
    ('message_reactions',       'USER',  'Cảm xúc tin nhắn'),
    ('message_gifts',           'USER',  'Quà trong tin nhắn'),
    ('conversations',           'USER',  'Cuộc trò chuyện'),
    ('conversation_clears',     'USER',  'Xoá hội thoại phía user'),
    ('chat_partners',           'USER',  'Danh sách trò chuyện'),
    ('group_messages',          'USER',  'Tin nhắn nhóm'),
    ('chat_group_messages',     'USER',  'Tin nhắn nhóm (bảng phụ)'),
    ('virtual_chat_messages',   'USER',  'Tin nhắn ảo'),
    ('follows',                 'USER',  'Theo dõi'),
    ('profile_views',           'USER',  'Lượt xem hồ sơ'),
    ('profile_views_today',     'USER',  'Lượt xem hồ sơ hôm nay'),
    ('profile_pings',           'USER',  'Ping hồ sơ'),
    ('notifications',           'USER',  'Thông báo'),
    ('stories',                 'USER',  'Story'),
    ('story_views',             'USER',  'Lượt xem story'),
    ('story_reactions',         'USER',  'Cảm xúc story'),
    ('red_packets',             'USER',  'Lì xì'),
    ('red_packet_claims',       'USER',  'Nhận lì xì'),
    ('user_blocks',             'USER',  'Chặn người dùng'),
    -- B. ADMIN / ADMIN PANEL
    ('admin_logs',              'ADMIN', 'Nhật ký quản trị'),
    ('admin_comment_jobs',      'ADMIN', 'Job bình luận tự động'),
    ('admin_job_locks',         'ADMIN', 'Khoá job'),
    ('moderation_queue',        'ADMIN', 'Hàng đợi kiểm duyệt'),
    ('bot_actions_logs',        'ADMIN', 'Nhật ký bot'),
    ('bot_activity_queue',      'ADMIN', 'Hàng đợi bot'),
    -- C. SYSTEM / CONFIG
    ('leaderboard_weights',     'SYSTEM','Trọng số bảng xếp hạng'),
    ('leaderboard_refresh_state','SYSTEM','Trạng thái làm mới BXH'),
    ('engagement_campaigns',    'SYSTEM','Chiến dịch tương tác'),
    -- E. LOG / AUDIT / THỐNG KÊ
    ('activity_logs',           'LOG',   'Nhật ký hoạt động'),
    ('member_activity_log',     'LOG',   'Nhật ký thành viên'),
    ('agent_activity_logs',     'LOG',   'Nhật ký agent'),
    ('keyword_logs',            'LOG',   'Nhật ký từ khoá'),
    ('candy_logs',              'LOG',   'Nhật ký candy'),
    ('dice_logs',               'LOG',   'Nhật ký xúc xắc'),
    ('system_health_logs',      'LOG',   'Sức khoẻ hệ thống'),
    ('security_events',         'LOG',   'Sự kiện bảo mật'),
    ('spam_detection_logs',     'LOG',   'Phát hiện spam'),
    ('rate_limit_hits',         'LOG',   'Chạm giới hạn tần suất'),
    ('risk_scores',             'LOG',   'Điểm rủi ro'),
    ('engagement_events',       'LOG',   'Sự kiện tương tác'),
    ('engagement_points_log',   'LOG',   'Điểm tương tác'),
    ('weekly_scores',           'LOG',   'Điểm tuần'),
    ('leaderboard_daily',       'LOG',   'BXH theo ngày'),
    ('group_stats_log',         'LOG',   'Thống kê nhóm'),
    ('group_leave_log',         'LOG',   'Rời nhóm'),
    ('nearby_match_notifications','LOG', 'Thông báo ghép gần đây'),
    ('connect_scan_usage',      'LOG',   'Lượt quét kết nối')
)
select
  w.table_name,
  (xpath('/row/c/text()',
     query_to_xml(format('select count(*) as c from public.%I', w.table_name),
                  false, true, '')))[1]::text::bigint as row_count,
  w.category,
  w.note as ghi_chu
from wanted w
join pg_tables t on t.schemaname = 'public' and t.tablename = w.table_name
union all
select w.table_name, null::bigint, w.category, 'BẢNG KHÔNG TỒN TẠI'
from wanted w
left join pg_tables t on t.schemaname = 'public' and t.tablename = w.table_name
where t.tablename is null
order by 3, 1;

-- 2) MỌI BẢNG PUBLIC (kể cả bảng chưa liệt kê) ------------------------
select t.tablename as table_name,
       (xpath('/row/c/text()',
          query_to_xml(format('select count(*) as c from public.%I', t.tablename),
                       false, true, '')))[1]::text::bigint as row_count,
       'TAT_CA' as category,
       'Toàn bộ bảng schema public' as ghi_chu
from pg_tables t
where t.schemaname = 'public'
order by 2 desc nulls last;

-- 3) TỔNG THEO NHÓM ---------------------------------------------------
with cat as (
  select tablename,
    case
      when tablename like 'admin_%' or tablename like 'bot_%'
           or tablename = 'moderation_queue' then 'TOTAL ADMIN DATA'
      when tablename like '%_log' or tablename like '%_logs'
           or tablename in ('security_events','spam_detection_logs','rate_limit_hits',
                            'risk_scores','engagement_events','engagement_points_log',
                            'weekly_scores','leaderboard_daily') then 'TOTAL LOG DATA'
      when tablename like 'leaderboard_%' or tablename = 'engagement_campaigns' then 'TOTAL SYSTEM DATA'
      else 'TOTAL USER DATA'
    end as category
  from pg_tables where schemaname = 'public'
)
select category, count(*) as so_bang,
       sum((xpath('/row/c/text()',
            query_to_xml(format('select count(*) as c from public.%I', tablename),
                         false, true, '')))[1]::text::bigint) as tong_ban_ghi
from cat group by category order by category;

-- 4) F. STORAGE OBJECTS ----------------------------------------------
select b.name as bucket, count(o.id) as row_count, 'STORAGE' as category,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) as ghi_chu
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.name
order by b.name;
