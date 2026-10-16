-- =====================================================================
-- CHỈ ĐỌC — CHẠY TRÊN SUPABASE 1 (gxfxqbhxoghdhokwjpex).
-- Không tạo / sửa / xoá gì. Gửi lại kết quả từng mục.
-- =====================================================================

-- 1) Các hàm của hệ thống lượt đăng bài có tồn tại không.
select f.name,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = f.name) as co_mat
  from (values ('reserve_post_slot'), ('mark_post_charge_used'), ('refund_post_slot'),
               ('grant_new_user_free_posts'), ('claim_free_posts_celebration'),
               ('reserve_internal_post_ticket')) as f(name);

-- 2) Trigger cấp lượt cho tài khoản mới có gắn vào profiles không.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.profiles'::regclass and not tgisinternal
   and pg_get_triggerdef(oid) ilike '%free_posts%';

-- 3) Bảng post_quota đã có cột của bản 20 lượt chưa.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'post_quota' order by ordinal_position;

-- 4) Tổng quan 20 lượt (user thường, không tính Admin / tài khoản nội bộ).
select count(*)                                         as so_user_thuong,
       count(q.user_id)                                 as co_ban_ghi_quota,
       count(*) filter (where q.user_id is null)        as thieu_ban_ghi_quota,
       count(*) filter (where q.free_v20)               as da_nang_20,
       count(*) filter (where q.free_v20 is not true)   as chua_nang_20,
       count(*) filter (where q.free_celebrated_at is not null) as da_xem_thong_bao
  from public.profiles p
  left join public.post_quota q on q.user_id = p.id
 where coalesce(p.is_admin, false) = false
   and coalesce(p.account_source, '') <> 'internal';

-- 5) Phân bố số lượt miễn phí còn lại.
select q.free_remaining, count(*) as so_user
  from public.post_quota q join public.profiles p on p.id = q.user_id
 where coalesce(p.is_admin, false) = false
   and coalesce(p.account_source, '') <> 'internal'
 group by 1 order by 1 desc;

-- 6) Lượt đã giữ nhưng bài KHÔNG được tạo (vé còn 'reserved') —
--    đây là các lượt bị trừ oan do lỗi Supabase 3.
select kind, status, count(*) as so_ve, count(distinct user_id) as so_user,
       min(created_at) as tu_luc, max(created_at) as den_luc
  from public.post_charges group by 1, 2 order by 1, 2;

-- 7) User đã bị thu phí trong khi vẫn còn lượt miễn phí (không được xảy ra).
select c.user_id, count(*) as so_lan_thu_phi, max(q.free_remaining) as luot_mien_phi_con
  from public.post_charges c join public.post_quota q on q.user_id = c.user_id
 where c.kind = 'paid' and q.free_remaining > 0
 group by 1 order by 2 desc limit 50;
