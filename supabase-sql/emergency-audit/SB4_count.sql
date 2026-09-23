-- =====================================================================
-- SB4 (bait groups / zalo / albums / reports) — AUDIT ĐẾM DỮ LIỆU
-- CHỈ ĐỌC 100%: chỉ SELECT. Không INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP.
-- Chạy trong SQL Editor của Supabase #4.
-- =====================================================================

-- 1) ĐẾM TỪNG BẢNG ----------------------------------------------------
with wanted(table_name, category, note) as (
  values
    -- A. USER DATA
    ('albums',                'USER',   'Album ảnh/video (có price, fake_purchase_count)'),
    ('album_items',           'USER',   'Ảnh/video trong album'),
    ('reports',               'USER',   'Tố cáo nhận thưởng'),
    ('zalo_user_areas',       'USER',   'Khu vực Zalo của người dùng'),
    ('rps_challenges',        'USER',   'Kèo oẳn tù tì'),
    ('rps4_rooms',            'USER',   'Phòng oẳn tù tì'),
    ('nearby_inventory',      'USER',   'Kho vật phẩm Quanh Đây'),
    ('nearby_dragon_wishes',  'USER',   'Điều ước rồng'),
    ('map_coordinates',       'USER',   'Toạ độ bản đồ'),
    -- B. ADMIN / ADMIN PANEL
    ('seed_account_groups',   'ADMIN',  'Nhóm nick seed'),
    ('seeding_follow_logs',   'ADMIN',  'Nhật ký seeding follow'),
    ('nearby_pool',           'ADMIN',  'Hồ dữ liệu Quanh Đây do admin nạp'),
    -- C. SYSTEM / CONFIG
    ('site_branding',         'SYSTEM', 'Logo / thương hiệu website'),
    ('bait_group_folders',    'SYSTEM', 'Thư mục Nhóm Mồi'),
    ('bait_groups',           'SYSTEM', 'Nhóm Mồi'),
    ('zalo_bait_groups',      'SYSTEM', 'Nhóm mồi Zalo'),
    ('zalo_area_groups',      'SYSTEM', 'Nhóm theo khu vực'),
    ('zalo_country_cards',    'SYSTEM', 'Thẻ quốc gia'),
    ('zalo_sub_items_l1',     'SYSTEM', 'Mục con cấp 1'),
    ('zalo_sub_items_l2',     'SYSTEM', 'Mục con cấp 2'),
    ('zalo_float_icon',       'SYSTEM', 'Icon nổi Zalo'),
    ('zalo_media_library',    'SYSTEM', 'Thư viện media Zalo'),
    ('nearby_settings',       'SYSTEM', 'Cấu hình Quanh Đây')
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

-- 2) MỌI BẢNG PUBLIC --------------------------------------------------
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
      when tablename in ('seed_account_groups','seeding_follow_logs','nearby_pool') then 'TOTAL ADMIN DATA'
      when tablename like 'zalo_%' or tablename like 'bait_%'
           or tablename in ('site_branding','nearby_settings') then 'TOTAL SYSTEM DATA'
      when tablename like '%_log' or tablename like '%_logs' then 'TOTAL LOG DATA'
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

-- 5) ALBUM: kiểm tra nhanh album có phí / miễn phí (chỉ đọc) ----------
select count(*) filter (where coalesce(price,0) > 0) as album_co_phi,
       count(*) filter (where coalesce(price,0) = 0) as album_mien_phi,
       count(*) as tong_album
from public.albums;
