-- =====================================================================
-- ĐỔI KHOÁ KÝ VÉ ĐĂNG BÀI — BƯỚC A (Supabase 1).
-- Không đụng lượt đăng, post_charges, số dư hay bài viết.
-- Lượt đã trả nhưng chưa dùng vẫn còn nguyên và sẽ được ký lại bằng khoá mới.
--
-- 1. Chạy file này trên SQL Editor của Supabase 1. Kết quả hiện 1 chuỗi mới.
-- 2. Copy chuỗi đó dán NGAY vào file ROTATE_post_ticket_key_SB3.sql trong SQL
--    Editor của Supabase 3 rồi chạy. KHÔNG dán vào chat, file trong code, Zalo, email...
-- 3. Trong vài phút giữa bước 1 và 2, người dùng có thể thấy "đăng lỗi";
--    đăng lại sẽ dùng lại đúng lượt đã trả, không bị trừ thêm.
-- =====================================================================
update private.post_ticket_secret
   set secret = encode(extensions.gen_random_bytes(32), 'hex')
 where id;

select secret as copy_this_into_sb3_rotate_file from private.post_ticket_secret;
