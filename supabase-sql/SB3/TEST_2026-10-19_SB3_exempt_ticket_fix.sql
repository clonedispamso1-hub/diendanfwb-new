-- =====================================================================
-- KIỂM THỬ SAU KHI CHẠY PROPOSED_2026-10-19_SB3_exempt_ticket_fix.sql — SUPABASE 3.
-- Toàn bộ chạy trong 1 giao dịch và ROLLBACK ở cuối → KHÔNG để lại bài / sổ vé.
-- Vé thử được ký NGAY TRONG giao dịch bằng khoá có sẵn; không in khoá, không in vé.
-- Chạy bằng psql (cần \set). Thay 2 UID bằng tài khoản THỬ NGHIỆM:
--   \set admin_uid '<uuid tài khoản admin thử>'
--   \set user_uid  '<uuid tài khoản thường thử>'
-- Mỗi ca in ra 1 dòng: ca | ket_qua (OK / FAIL + mã lỗi).
-- =====================================================================
begin;

create function pg_temp.sign(p_charge uuid, p_user uuid, p_kind text, p_ttl int default 600)
returns text language sql as $$
  select m || '.' || encode(extensions.hmac(m, (select secret from private.post_ticket_secret where id), 'sha256'), 'hex')
    from (select p_charge::text || '.' || p_user::text || '.' || p_kind || '.'
                 || floor(extract(epoch from now()) + p_ttl)::bigint::text as m) s $$;

create function pg_temp.try(p_case text, p_uid uuid, p_post_user uuid, p_ticket text, p_expect text)
returns table(ca text, ket_qua text) language plpgsql as $$
declare v_err text := 'OK';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    insert into public.posts(user_id, content, visibility, category, status, post_ticket)
    values (p_post_user, '[TEST exempt fix — rollback]', 'home', 'general', 'published', p_ticket);
  exception when others then v_err := split_part(sqlerrm, ':', 1);
  end;
  perform set_config('request.jwt.claims', '', true);
  return query select p_case, case when v_err = p_expect then 'OK' else 'FAIL (' || v_err || ')' end;
end $$;

-- Vé thử dùng lại ở nhiều ca
select gen_random_uuid() as c_exempt \gset

select * from pg_temp.try('1 Admin + vé exempt hợp lệ -> đăng được',
  :'admin_uid', :'admin_uid', pg_temp.sign(:'c_exempt', :'admin_uid', 'exempt'), 'OK');
select * from pg_temp.try('2 Dùng lại đúng vé exempt đó -> USED',
  :'admin_uid', :'admin_uid', pg_temp.sign(:'c_exempt', :'admin_uid', 'exempt'), 'POST_TICKET_USED');
select * from pg_temp.try('3 Vé exempt của Admin, phiên user khác -> INVALID',
  :'user_uid', :'user_uid', pg_temp.sign(gen_random_uuid(), :'admin_uid', 'exempt'), 'POST_TICKET_INVALID');
select * from pg_temp.try('4 Vé exempt, bài gán cho user khác -> INVALID',
  :'admin_uid', :'user_uid', pg_temp.sign(gen_random_uuid(), :'admin_uid', 'exempt'), 'POST_TICKET_INVALID');
select * from pg_temp.try('5 Vé exempt chữ ký sai -> INVALID',
  :'admin_uid', :'admin_uid', left(pg_temp.sign(gen_random_uuid(), :'admin_uid', 'exempt'), -1) || '0', 'POST_TICKET_INVALID');
select * from pg_temp.try('6 Vé exempt hết hạn -> EXPIRED',
  :'admin_uid', :'admin_uid', pg_temp.sign(gen_random_uuid(), :'admin_uid', 'exempt', -60), 'POST_TICKET_EXPIRED');
select * from pg_temp.try('7 Tài khoản thường + vé free hợp lệ -> đăng được (nhánh cũ)',
  :'user_uid', :'user_uid', pg_temp.sign(gen_random_uuid(), :'user_uid', 'free'), 'OK');
select * from pg_temp.try('8 Tài khoản thường không có vé -> REQUIRED',
  :'user_uid', :'user_uid', null, 'POST_TICKET_REQUIRED');
select * from pg_temp.try('9 Loại vé lạ -> INVALID',
  :'user_uid', :'user_uid', pg_temp.sign(gen_random_uuid(), :'user_uid', 'vip'), 'POST_TICKET_INVALID');

rollback;
