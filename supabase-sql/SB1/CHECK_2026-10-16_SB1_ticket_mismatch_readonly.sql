-- CHỈ ĐỌC — CHẠY TRÊN SUPABASE 1. Không ghi gì, không hiện khoá.
-- Mục đích: tìm vì sao khoa_khop_supabase_1 = false ở Supabase 3.

-- 1) Định nghĩa THỰC TẾ của hàm ký vé đang chạy (có thể khác file trong code).
select pg_get_functiondef('private.sign_post_ticket(uuid,uuid,text)'::regprocedure) as dinh_nghia_ham_ky;

-- 2) Các bản hmac đang có (kiểu tham số khác nhau có thể cho kết quả khác nhau).
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as tham_so
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname = 'hmac' order by 1, 3;

-- 3) Dấu vân tay khoá (KHÔNG lộ khoá): HMAC của một chuỗi công khai cố định.
--    So sánh cột "van_tay" với cùng câu lệnh ở Supabase 3. Khác nhau = khoá khác nhau.
select count(*)                                                          as so_dong,
       length(min(secret))                                               as do_dai,
       bool_or(secret ~ '^[0-9a-f]{64}$')                                as dung_dinh_dang,
       bool_or(secret <> btrim(secret, E' \t\r\n'))                       as co_khoang_trang,
       left(encode(extensions.hmac('fingerprint-check', min(secret), 'sha256'), 'hex'), 16) as van_tay
  from private.post_ticket_secret;

-- 4) Tự kiểm vé ngay tại Supabase 1: ký 1 vé mẫu rồi xác minh lại bằng chính khoá SB1.
--    Mong đợi tu_kiem_ok = true. Nếu false → hàm ký trên SB1 khác cách SB3 xác minh.
with t as (
  select private.sign_post_ticket('00000000-0000-0000-0000-000000000000'::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid,
                                  'keycheck') as ve
), p as (select ve, string_to_array(ve, '.') as a from t)
select ve                                            as ve_mau,
       array_length(a, 1)                            as so_phan,
       length(ve)                                    as do_dai_ve,
       encode(extensions.hmac(a[1]||'.'||a[2]||'.'||a[3]||'.'||a[4],
              (select secret from private.post_ticket_secret where id), 'sha256'), 'hex') = a[5]
                                                     as tu_kiem_ok
  from p;
