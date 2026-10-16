-- =====================================================================
-- CHỈ ĐỌC — CHẠY TRÊN SUPABASE 3 (uaqsetfdciyzxpuhulux).
-- Không tạo / sửa / xoá gì. Chạy TRƯỚC và SAU file FIX_... để so sánh.
-- =====================================================================

-- 1) Các hàm trong schema private mà trigger đăng bài cần.
--    Mong đợi sau khi sửa: enforce_post_ticket, lock_post_charge_id,
--    post_ticket_trusted_caller đều có mặt (= true).
select f.name,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'private' and p.proname = f.name) as co_mat
  from (values ('enforce_post_ticket'), ('lock_post_charge_id'),
               ('post_ticket_trusted_caller')) as f(name);

-- 2) Các bảng private mà trigger cần (khoá ký vé + sổ vé đã dùng).
select t.name, to_regclass('private.' || t.name) is not null as co_mat
  from (values ('post_ticket_secret'), ('used_post_charges')) as t(name);

-- 3) Khoá ký vé đã được cài chưa (chỉ đếm, KHÔNG hiện giá trị khoá).
select count(*) as so_khoa from private.post_ticket_secret;

-- 4) Trigger đang gắn trên bảng posts.
select tgname, tgenabled, pg_get_triggerdef(t.oid) as dinh_nghia
  from pg_trigger t
 where t.tgrelid = 'public.posts'::regclass and not t.tgisinternal
 order by tgname;

-- 5) Bài mới nhất + số bài mỗi giờ trong 24h qua (để thấy lúc bài ngừng vào).
select max(created_at) as bai_moi_nhat, count(*) as tong_bai from public.posts;
select date_trunc('hour', created_at) as gio, count(*) as so_bai
  from public.posts where created_at > now() - interval '24 hours'
 group by 1 order by 1 desc;
