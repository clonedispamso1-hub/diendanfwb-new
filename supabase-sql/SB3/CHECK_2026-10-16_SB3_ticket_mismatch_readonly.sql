-- CHỈ ĐỌC — CHẠY TRÊN SUPABASE 3. Không ghi gì, không hiện khoá.
-- Dán ve_mau (cột ve_mau, file CHECK_2026-10-16_SB1_ticket_mismatch_readonly.sql) vào DAN_VE_MAU.

-- 1) Dấu vân tay khoá — so với cột van_tay ở Supabase 1.
select count(*)                                                          as so_dong,
       length(min(secret))                                               as do_dai,
       bool_or(secret ~ '^[0-9a-f]{64}$')                                as dung_dinh_dang,
       bool_or(secret <> btrim(secret, E' \t\r\n'))                       as co_khoang_trang,
       left(encode(extensions.hmac('fingerprint-check', min(secret), 'sha256'), 'hex'), 16) as van_tay
  from private.post_ticket_secret;

-- 2) Định dạng vé mẫu đã dán (phát hiện dán thiếu / thừa khoảng trắng / xuống dòng).
with t as (select 'DAN_VE_MAU'::text as ve)
select length(ve)                                   as do_dai_ve,
       ve <> btrim(ve, E' \t\r\n')                  as co_khoang_trang,
       array_length(string_to_array(btrim(ve, E' \t\r\n'), '.'), 1) as so_phan,
       length(split_part(btrim(ve, E' \t\r\n'), '.', 5)) as do_dai_chu_ky  -- phải = 64
  from t;

-- 3) Xác minh lại theo ĐÚNG cách trigger làm (hmac text, sha256, hex), sau khi bỏ khoảng trắng.
with t as (select string_to_array(btrim('DAN_VE_MAU', E' \t\r\n'), '.') as p)
select encode(extensions.hmac(p[1]||'.'||p[2]||'.'||p[3]||'.'||p[4],
              (select secret from private.post_ticket_secret where id), 'sha256'), 'hex') = p[5]
       as khoa_khop_supabase_1
  from t;

-- 4) Định nghĩa thực tế của hàm xác minh vé (đối chiếu cách ghép chuỗi).
select pg_get_functiondef('private.enforce_post_ticket()'::regprocedure) as dinh_nghia_trigger;
