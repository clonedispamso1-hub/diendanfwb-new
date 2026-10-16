-- CHỈ ĐỌC — CHẠY TRÊN SUPABASE 1. Không hiện giá trị khoá.
-- Supabase 1 ký vé bằng private.sign_post_ticket() với khoá trong private.post_ticket_secret.
select count(*)                                   as so_dong,
       bool_or(secret ~ '^[0-9a-f]{64}$')         as dung_dinh_dang_64_hex
  from private.post_ticket_secret;

select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'private' and p.proname = 'sign_post_ticket') as co_ham_ky_ve;

-- Vé MẪU để đối chiếu khoá giữa 2 database (loại 'keycheck' → trigger luôn từ chối,
-- không dùng để đăng bài được; không ghi gì vào database).
-- Copy chuỗi ve_mau này sang bước kiểm tra cuối trong file FIX của Supabase 3.
select private.sign_post_ticket('00000000-0000-0000-0000-000000000000'::uuid,
                                '00000000-0000-0000-0000-000000000000'::uuid,
                                'keycheck') as ve_mau;
