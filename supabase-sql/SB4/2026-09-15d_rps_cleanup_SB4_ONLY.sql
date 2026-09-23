-- ============================================================
-- SB4 ONLY — Dọn sạch toàn bộ đối tượng Kéo Búa Bao (RPS)
-- ⚠️ KHÔNG chạy file này trên Supabase #1 / #2 / #3.
-- ⚠️ Script này CHƯA được thực thi. Hãy tự chạy thủ công trên SQL Editor của SB4
--    sau khi đã backup (các bảng bên dưới sẽ bị xoá vĩnh viễn).
-- Nguồn đối tượng: 2026-09-15_rps_challenges.sql, 2026-09-15b_rps_cancel_by_opponent.sql,
--                  2026-09-15c_rps4_rooms.sql
-- ============================================================

begin;

-- 1) Gỡ realtime publication (bỏ qua nếu bảng không nằm trong publication)
do $$
begin
  begin execute 'alter publication supabase_realtime drop table public.rps_challenges'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime drop table public.rps4_rooms';     exception when others then null; end;
end $$;

-- 2) Xoá RPC functions
drop function if exists public.rps4_expire_due()                                                   cascade;
drop function if exists public.rps4_create_challenge(uuid, uuid, bigint, bigint, integer)          cascade;
drop function if exists public.rps4_create_challenge(uuid, uuid, bigint, bigint)                   cascade;
drop function if exists public.rps4_get_challenge(uuid)                                            cascade;
drop function if exists public.rps4_accept_challenge(uuid, uuid)                                   cascade;
drop function if exists public.rps4_cancel_challenge(uuid, uuid)                                   cascade;
drop function if exists public.rps4_active_room(uuid)                                              cascade;
drop function if exists public.rps4_play_move(bigint, uuid, text)                                  cascade;
drop function if exists public.rps4_resolve_timeout(bigint)                                        cascade;
drop function if exists public.rps4_forfeit(bigint, uuid)                                          cascade;
drop function if exists public.rps4_room_state(bigint, uuid)                                       cascade;
drop function if exists public.rps4_claim_settlement(bigint)                                       cascade;

-- Phòng hờ: xoá mọi function còn lại có tên bắt đầu bằng rps_ / rps4_ trong schema public
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'rps4\_%' or p.proname like 'rps\_%')
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- 3) Xoá bảng (policies, index, trigger đi kèm sẽ bị xoá theo)
drop table if exists public.rps4_rooms     cascade;
drop table if exists public.rps_challenges cascade;

-- 4) Xoá enum/type riêng của RPS nếu có
do $$
declare t record;
begin
  for t in
    select n.nspname, ty.typname
    from pg_type ty
    join pg_namespace n on n.oid = ty.typnamespace
    where n.nspname = 'public' and ty.typname like 'rps%'
  loop
    execute format('drop type if exists %I.%I cascade', t.nspname, t.typname);
  end loop;
end $$;

commit;

-- 5) Kiểm tra sau khi chạy — cả 2 query phải trả về 0 dòng
-- select table_name from information_schema.tables where table_schema='public' and table_name like 'rps%';
-- select proname   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname like 'rps%';
