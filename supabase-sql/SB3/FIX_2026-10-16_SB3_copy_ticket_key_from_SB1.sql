-- =====================================================================
-- CHẠY TRÊN SUPABASE 3. Chỉ chạy khi file CHECK SB3 báo con_chu_mau = true
-- (hoặc khoa_null = true / dung_dinh_dang_64_hex = false).
--
-- Việc duy nhất: chép khoá ĐANG DÙNG của Supabase 1 sang dòng khoá của Supabase 3.
-- KHÔNG tạo khoá mới, KHÔNG đổi khoá Supabase 1, KHÔNG sửa trigger / bài viết.
--
-- Cách lấy khoá: SQL Editor Supabase 1 → chạy
--     select secret from private.post_ticket_secret;
-- copy kết quả, dán thay cho DAN_KHOA_DANG_DUNG_O_SB1 ở dòng v_new bên dưới.
-- CHỈ dán trong SQL Editor. Không dán vào chat, file code, Zalo, email.
-- Không lưu file này sau khi đã dán khoá.
-- =====================================================================
begin;

do $$
declare
  v_new text := 'DAN_KHOA_DANG_DUNG_O_SB1';
  v_cur text;
  v_rows int;
begin
  -- Điều kiện 1: khoá dán vào đúng dạng khoá Supabase 1 tạo ra (64 ký tự 0-9a-f).
  if v_new !~ '^[0-9a-f]{64}$' then
    raise exception 'Khoá dán vào không đúng dạng 64 ký tự 0-9a-f — không sửa gì.';
  end if;

  -- Điều kiện 2: phải có đúng 1 dòng khoá (không tự tạo dòng mới).
  select count(*) into v_rows from private.post_ticket_secret;
  if v_rows <> 1 then
    raise exception 'Bảng khoá có % dòng (cần đúng 1) — dừng, không sửa gì.', v_rows;
  end if;

  -- Điều kiện 3: chỉ thay khi khoá hiện tại đang chưa cấu hình / sai dạng.
  -- Nếu SB3 đã có khoá hợp lệ thì dừng để kiểm tra thủ công, tránh ghi đè nhầm.
  select secret into v_cur from private.post_ticket_secret where id;
  if v_cur is not null and v_cur <> 'DAN_KHOA_TU_SUPABASE_1' and v_cur ~ '^[0-9a-f]{64}$' then
    raise exception 'Supabase 3 đã có khoá đúng dạng — dừng. Hãy báo lại để kiểm tra lệch khoá.';
  end if;

  update private.post_ticket_secret set secret = v_new where id;
end $$;

commit;

-- Kiểm tra sau khi chạy (chỉ đúng/sai, không hiện khoá):
select bool_or(secret ~ '^[0-9a-f]{64}$')         as dung_dinh_dang,
       bool_or(secret = 'DAN_KHOA_TU_SUPABASE_1') as con_chu_mau
  from private.post_ticket_secret;

-- Đối chiếu khoá 2 bên: dán ve_mau từ file CHECK SB1 vào chỗ DAN_VE_MAU. Mong đợi = true.
with t as (select string_to_array('DAN_VE_MAU', '.') as p)
select encode(extensions.hmac(p[1]||'.'||p[2]||'.'||p[3]||'.'||p[4],
              (select secret from private.post_ticket_secret where id), 'sha256'), 'hex') = p[5]
       as khoa_khop_supabase_1
  from t;
