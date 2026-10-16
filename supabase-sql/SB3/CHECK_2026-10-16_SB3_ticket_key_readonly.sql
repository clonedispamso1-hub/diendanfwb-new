-- CHỈ ĐỌC — CHẠY TRÊN SUPABASE 3. Không hiện giá trị khoá, chỉ hiện đúng/sai.
-- Trigger báo "chưa cấu hình khoá" khi khoá NULL hoặc còn là chữ mẫu 'DAN_KHOA_TU_SUPABASE_1'.
select count(*)                                                    as so_dong,
       bool_and(id)                                                as id_dung_true,
       bool_or(secret is null)                                     as khoa_null,
       bool_or(secret = 'DAN_KHOA_TU_SUPABASE_1')                  as con_chu_mau,
       bool_or(secret ~ '^[0-9a-f]{64}$')                          as dung_dinh_dang_64_hex,
       bool_or(secret <> btrim(secret))                            as co_khoang_trang_thua
  from private.post_ticket_secret;

-- Hàm hmac mà trigger dùng có sẵn không.
select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'extensions' and p.proname = 'hmac') as co_ham_hmac;
