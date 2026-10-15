set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', false);
select public.mark_post_charge_used(c.id) from post_charges c where user_id='00000000-0000-0000-0000-0000000000c2' and status='reserved';
select (public.reserve_post_slot(true)->>'ticket') as t5 \gset
insert into posts(user_id,content,post_ticket) values ('00000000-0000-0000-0000-0000000000c2','paid ok',:'t5') returning 'T4b OK' as result;
reset role;
select gem_balance as gem_after_paid from profiles where id='00000000-0000-0000-0000-0000000000c2';
