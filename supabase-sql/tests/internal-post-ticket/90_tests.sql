\set ON_ERROR_STOP 0
-- data
insert into profiles values
 ('00000000-0000-0000-0000-00000000000a','admin',0,true,null),
 ('00000000-0000-0000-0000-0000000000b2','clone2',777,false,'internal'),
 ('00000000-0000-0000-0000-0000000000c1','real_nofree',0,false,null),
 ('00000000-0000-0000-0000-0000000000c2','real_free',10000,false,null);
insert into user_roles values ('00000000-0000-0000-0000-00000000000a','admin');
update post_quota set free_remaining=0 where user_id='00000000-0000-0000-0000-0000000000c1';
update post_quota set free_remaining=1 where user_id='00000000-0000-0000-0000-0000000000c2';
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false) $$;

\echo === T1 Tài khoản thứ hai: Admin lấy vé internal + đăng bài
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select (public.reserve_internal_post_ticket('00000000-0000-0000-0000-0000000000b2')->>'ticket') as t \gset
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000b2','clone post',:'t') returning 'T1 OK' as result;
\echo === T1b dùng lại cùng vé (phải USED)
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000b2','again',:'t');
\echo === T1c vé internal dùng cho user khác (phải INVALID)
select (public.reserve_internal_post_ticket('00000000-0000-0000-0000-0000000000b2')->>'ticket') as t2 \gset
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000c1','hijack',:'t2');
reset role;
\echo === T2 gem + lượt của tài khoản thứ hai không đổi (777, không có post_charges)
select gem_balance, (select count(*) from post_charges where user_id=p.id) charges from profiles p where id='00000000-0000-0000-0000-0000000000b2';

\echo === T3 user thật không lượt, không trả: bị chặn
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select public.reserve_post_slot(false)->>'code' as code;
insert into posts(user_id,content) values ('00000000-0000-0000-0000-0000000000c1','no ticket');
\echo === T4 user thật có lượt miễn phí: đăng được
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select (public.reserve_post_slot(false)->>'ticket') as t4 \gset
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000c2','real ok',:'t4') returning 'T4 OK' as result;
\echo === T4b user thật trả phí: đăng được, trừ 5000
select (public.reserve_post_slot(true)->>'ticket') as t5 \gset
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000c2','paid ok',:'t5') returning 'T4b OK' as result;
\echo === T5 giả mạo: user thường gọi reserve_internal (phải FORBIDDEN)
select public.reserve_internal_post_ticket('00000000-0000-0000-0000-0000000000c2')->>'code' as code;
select public.reserve_internal_post_ticket('00000000-0000-0000-0000-0000000000b2')->>'code' as code;
\echo === T5b vé internal tự chế (chữ ký sai) -> INVALID
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000c2','fake', gen_random_uuid()::text||'.00000000-0000-0000-0000-0000000000c2.internal.9999999999.deadbeef');
\echo === T5c Admin xin vé internal cho user thật (phải NOT_INTERNAL)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.reserve_internal_post_ticket('00000000-0000-0000-0000-0000000000c2')->>'code' as code;
\echo === T5d gọi API thiếu role trong JWT (không còn được bỏ qua)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
insert into posts(user_id,content) values ('00000000-0000-0000-0000-0000000000c1','no role');
\echo === T5e anon không gọi được hàm
set role anon; select set_config('request.jwt.claims','{"role":"anon"}',false);
select public.reserve_internal_post_ticket('00000000-0000-0000-0000-0000000000b2');
reset role;
select gem_balance from profiles where id='00000000-0000-0000-0000-0000000000c2';
