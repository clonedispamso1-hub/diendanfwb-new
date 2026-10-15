-- =====================================================================
-- ĐỔI KHOÁ KÝ VÉ ĐĂNG BÀI — BƯỚC B (Supabase 3), chạy ngay sau bước A ở Supabase 1.
-- Thay KHOA_MOI_TU_SB1 bằng chuỗi vừa nhận ở bước A (chỉ dán trong SQL Editor).
-- Sau khi chạy, khoá cũ (đã lộ) không còn tạo được vé hợp lệ.
-- Không đụng bài viết hay sổ lượt đã dùng.
-- =====================================================================
do $$
declare v_new text := 'KHOA_MOI_TU_SB1';
begin
  if v_new !~ '^[0-9a-f]{64}$' then
    raise exception 'Chưa dán đúng khoá mới (64 ký tự 0-9a-f).';
  end if;
  update private.post_ticket_secret set secret = v_new where id;
  if not found then
    insert into private.post_ticket_secret(id, secret) values (true, v_new);
  end if;
end $$;

-- Kiểm tra (chỉ hiện 8 ký tự đầu để đối chiếu với SB1, không hiện cả khoá).
select left(secret, 8) as key_prefix from private.post_ticket_secret;
