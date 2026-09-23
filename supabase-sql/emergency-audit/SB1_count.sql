-- =====================================================================
-- SB1 (core: auth / profiles / ví / admin) — AUDIT ĐẾM DỮ LIỆU
-- CHỈ ĐỌC 100%: chỉ SELECT. Không INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP.
-- Chạy trong SQL Editor của Supabase #1.
-- Bảng không tồn tại sẽ hiện row_count = NULL (ghi chú "không tồn tại").
-- =====================================================================

-- 1) ĐẾM TỪNG BẢNG THEO NHÓM -----------------------------------------
with wanted(table_name, category, note) as (
  values
    -- A. USER DATA
    ('profiles',                    'USER',      'Hồ sơ thành viên (gồm cả admin)'),
    ('user_blocks',                 'USER',      'Chặn người dùng'),
    ('stories',                     'USER',      'Story'),
    ('story_views',                 'USER',      'Lượt xem story'),
    ('videos_social',               'USER',      'Video người dùng'),
    ('video_likes',                 'USER',      'Thích video'),
    ('video_comments',              'USER',      'Bình luận video'),
    ('video_views',                 'USER',      'Lượt xem video'),
    ('post_gifts',                  'USER',      'Quà tặng bài viết'),
    ('gifts',                       'USER',      'Quà tặng'),
    ('gift_history',                'USER',      'Lịch sử quà'),
    ('red_packets',                 'USER',      'Lì xì'),
    ('red_packet_claims',           'USER',      'Nhận lì xì'),
    ('pet_collection',              'USER',      'Thú cưng'),
    ('pet_transactions',            'USER',      'Giao dịch thú cưng'),
    ('pet_reward_requests',         'USER',      'Yêu cầu thưởng thú cưng'),
    ('inventory',                   'USER',      'Kho vật phẩm'),
    ('referrals',                   'USER',      'Giới thiệu'),
    ('connect_scan_usage',          'USER',      'Lượt quét kết nối'),
    ('phone_verifications',         'USER',      'Xác minh SĐT'),
    ('profile_verifications',       'USER',      'Xác minh hồ sơ'),
    ('feedback_posts',              'USER',      'Góp ý người dùng'),
    ('guides',                      'USER',      'Bài hướng dẫn'),
    ('user_locations',              'USER',      'Vị trí người dùng'),
    ('daily_follow_stats',          'USER',      'Thống kê theo dõi ngày'),
    ('second_accounts',             'USER',      'Tài khoản phụ'),
    ('crm_customers',               'USER',      'CRM khách hàng'),
    ('crm_expenses',                'USER',      'CRM chi phí'),
    -- B. ADMIN / ADMIN PANEL
    ('bangchu',                     'ADMIN',     'Tài khoản Bang Chủ / Admin Panel'),
    ('user_roles',                  'ADMIN',     'Phân quyền'),
    ('bot_roles',                   'ADMIN',     'Quyền bot'),
    ('admin_permissions',           'ADMIN',     'Quyền admin'),
    ('admin_role_assignments',      'ADMIN',     'Gán vai trò admin'),
    ('admin_gift_batch_log',        'ADMIN',     'Nhật ký tặng quà hàng loạt'),
    ('bot_accounts',                'ADMIN',     'Tài khoản bot'),
    ('bot_assignments',             'ADMIN',     'Phân công bot'),
    ('bot_settings',                'ADMIN',     'Cấu hình bot'),
    ('seed_accounts',               'ADMIN',     'Nick seed'),
    ('fake_profiles',               'ADMIN',     'Hồ sơ ảo'),
    ('fake_follows',                'ADMIN',     'Theo dõi ảo'),
    ('internal_account_credentials','ADMIN',     'Tài khoản nội bộ'),
    ('nicktuongtac',                'ADMIN',     'Nick tương tác'),
    ('user_restrictions',           'ADMIN',     'Hạn chế người dùng'),
    ('reports',                     'ADMIN',     'Tố cáo'),
    ('user_reports',                'ADMIN',     'Tố cáo người dùng'),
    ('post_reports',                'ADMIN',     'Tố cáo bài viết'),
    ('comment_reports',             'ADMIN',     'Tố cáo bình luận'),
    ('blocked_ips',                 'ADMIN',     'IP bị chặn'),
    ('blocked_devices',             'ADMIN',     'Thiết bị bị chặn'),
    ('blocked_keywords',            'ADMIN',     'Từ khoá chặn'),
    ('banned_keywords',             'ADMIN',     'Từ khoá cấm'),
    ('device_signals',              'ADMIN',     'Tín hiệu thiết bị'),
    ('device_approvals',            'ADMIN',     'Duyệt thiết bị'),
    ('forced_logouts',              'ADMIN',     'Buộc đăng xuất'),
    ('admin_popups',                'ADMIN',     'Popup quản trị'),
    ('admin_popup_events',          'ADMIN',     'Sự kiện popup'),
    -- C. SYSTEM / CONFIG
    ('admin_config',                'SYSTEM',    'Cấu hình hệ thống'),
    ('admin_settings',              'SYSTEM',    'Cài đặt hệ thống'),
    ('admin_site_settings',         'SYSTEM',    'Cấu hình website'),
    ('gif_library',                 'SYSTEM',    'Thư viện GIF'),
    ('vip_icons',                   'SYSTEM',    'Icon VIP'),
    ('vip_icon_folders',            'SYSTEM',    'Thư mục icon VIP'),
    ('connect_settings',            'SYSTEM',    'Cấu hình kết nối'),
    -- D. FINANCIAL / WALLET
    ('gem_transactions',            'FINANCIAL', 'Giao dịch gem'),
    ('gem_history',                 'FINANCIAL', 'Lịch sử gem'),
    ('coin_transactions',           'FINANCIAL', 'Giao dịch xu'),
    ('coin_transfers',              'FINANCIAL', 'Chuyển xu'),
    ('transfer_transactions',       'FINANCIAL', 'Chuyển tiền nội bộ'),
    ('transactions',                'FINANCIAL', 'Giao dịch chung'),
    ('subscriptions',               'FINANCIAL', 'Gói đăng ký'),
    ('withdrawal_requests',         'FINANCIAL', 'Yêu cầu rút'),
    ('withdrawal_audit_log',        'FINANCIAL', 'Nhật ký rút tiền'),
    ('wallets',                     'FINANCIAL', 'Ví'),
    -- E. LOG / AUDIT
    ('admin_logs',                  'LOG',       'Nhật ký quản trị (bản SB1)'),
    ('activity_logs',               'LOG',       'Nhật ký hoạt động'),
    ('security_events',             'LOG',       'Sự kiện bảo mật'),
    ('login_attempts',              'LOG',       'Lần đăng nhập')
)
select
  w.table_name,
  (xpath('/row/c/text()',
     query_to_xml(format('select count(*) as c from public.%I', w.table_name),
                  false, true, '')))[1]::text::bigint as row_count,
  w.category,
  case when t.tablename is null then 'BẢNG KHÔNG TỒN TẠI' else w.note end as ghi_chu
from wanted w
left join pg_tables t
  on t.schemaname = 'public' and t.tablename = w.table_name
where t.tablename is not null
union all
select w.table_name, null::bigint, w.category, 'BẢNG KHÔNG TỒN TẠI'
from wanted w
left join pg_tables t on t.schemaname = 'public' and t.tablename = w.table_name
where t.tablename is null
order by 3, 1;

-- 2) TỔNG THEO NHÓM ---------------------------------------------------
with wanted(table_name, category) as (
  select tablename,
    case
      when tablename in ('gem_transactions','gem_history','coin_transactions','coin_transfers',
                         'transfer_transactions','transactions','subscriptions',
                         'withdrawal_requests','withdrawal_audit_log','wallets') then 'TOTAL FINANCIAL DATA'
      when tablename like 'admin_%' or tablename like 'bot_%'
           or tablename in ('bangchu','user_roles','admin_permissions','admin_role_assignments',
                            'seed_accounts','fake_profiles','fake_follows','nicktuongtac',
                            'internal_account_credentials','user_restrictions','reports','user_reports',
                            'post_reports','comment_reports','blocked_ips','blocked_devices',
                            'blocked_keywords','banned_keywords','device_signals','device_approvals',
                            'forced_logouts') then 'TOTAL ADMIN DATA'
      when tablename in ('gif_library','vip_icons','vip_icon_folders','connect_settings') then 'TOTAL SYSTEM DATA'
      when tablename like '%_logs' or tablename like '%_log'
           or tablename in ('security_events','login_attempts') then 'TOTAL LOG DATA'
      else 'TOTAL USER DATA'
    end
  from pg_tables where schemaname = 'public'
)
select category,
       count(*) as so_bang,
       sum((xpath('/row/c/text()',
            query_to_xml(format('select count(*) as c from public.%I', table_name),
                         false, true, '')))[1]::text::bigint) as tong_ban_ghi
from wanted
group by category
order by category;

-- 3) G. AUTH USERS ----------------------------------------------------
select 'auth.users' as table_name, count(*) as row_count, 'AUTH' as category,
       'Tổng tài khoản đăng nhập (gồm cả Admin)' as ghi_chu
from auth.users;

select 'auth.users (admin/bangchu)' as table_name, count(*) as row_count, 'AUTH' as category,
       'Tài khoản gắn với bản ghi bangchu' as ghi_chu
from auth.users u
where exists (select 1 from public.bangchu b where b.auth_user_id = u.id);

-- 4) F. STORAGE OBJECTS ----------------------------------------------
select b.name as bucket, count(o.id) as row_count, 'STORAGE' as category,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) as ghi_chu
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.name
order by b.name;
