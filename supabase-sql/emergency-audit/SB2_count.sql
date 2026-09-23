-- =====================================================================
-- SB2 (media / VIP / Live Móc) — AUDIT ĐẾM DỮ LIỆU
-- CHỈ ĐỌC 100%: chỉ SELECT. Không INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP.
-- Chạy trong SQL Editor của Supabase #2.
-- =====================================================================

-- 1) ĐẾM TỪNG BẢNG ----------------------------------------------------
with wanted(table_name, category, note) as (
  values
    -- A. USER DATA
    ('live_moc_rooms',        'USER',   'Phòng Live Móc'),
    ('live_moc_sessions',     'USER',   'Phiên live'),
    ('live_moc_messages',     'USER',   'Tin nhắn live'),
    ('live_moc_viewers',      'USER',   'Người xem live'),
    ('live_moc_gifts',        'USER',   'Quà trong live'),
    ('live_users',            'USER',   'Người dùng đang live'),
    ('vip_community_posts',   'USER',   'Bài Cộng Đồng VIP'),
    ('vip_community_comments','USER',   'Bình luận VIP'),
    ('vip_community_likes',   'USER',   'Thích VIP'),
    ('video_posts',           'USER',   'Bài video'),
    ('voice_messages',        'USER',   'Tin nhắn thoại'),
    ('clone_media',           'USER',   'Media nick clone'),
    ('feedback_attachments',  'USER',   'File đính kèm góp ý'),
    ('uploads',               'USER',   'File upload'),
    ('video_uploads',         'USER',   'Video upload'),
    ('media_items',           'USER',   'Media item'),
    ('media_library',         'USER',   'Thư viện media'),
    ('user_zalo',             'USER',   'Zalo của người dùng'),
    -- C. SYSTEM / CONFIG (do Admin cấu hình)
    ('site_settings2',        'SYSTEM', 'Cấu hình website (SB2)'),
    ('live_moc_settings',     'SYSTEM', 'Cấu hình Live Móc'),
    ('community_page',        'SYSTEM', 'Cấu hình trang Cộng Đồng'),
    ('voice_library',         'SYSTEM', 'Thư viện giọng nói')
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

-- 2) MỌI BẢNG PUBLIC KHÁC (phát hiện bảng chưa có trong danh sách) ----
select t.tablename as table_name,
       (xpath('/row/c/text()',
          query_to_xml(format('select count(*) as c from public.%I', t.tablename),
                       false, true, '')))[1]::text::bigint as row_count,
       'CHUA_PHAN_LOAI' as category,
       'Bảng tồn tại trong DB nhưng chưa nằm trong danh sách audit' as ghi_chu
from pg_tables t
where t.schemaname = 'public'
order by 1;

-- 3) TỔNG THEO NHÓM ---------------------------------------------------
select 'TOTAL (toàn bộ public)' as category,
       count(*) as so_bang,
       sum((xpath('/row/c/text()',
            query_to_xml(format('select count(*) as c from public.%I', tablename),
                         false, true, '')))[1]::text::bigint) as tong_ban_ghi
from pg_tables where schemaname = 'public';

-- 4) F. STORAGE OBJECTS ----------------------------------------------
select b.name as bucket, count(o.id) as row_count, 'STORAGE' as category,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) as ghi_chu
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.name
order by b.name;

-- 5) AUTH (SB2 không dùng đăng nhập — kiểm tra để chắc chắn) ----------
select 'auth.users' as table_name, count(*) as row_count, 'AUTH' as category,
       'Kỳ vọng = 0 vì SB2 không giữ phiên đăng nhập' as ghi_chu
from auth.users;
