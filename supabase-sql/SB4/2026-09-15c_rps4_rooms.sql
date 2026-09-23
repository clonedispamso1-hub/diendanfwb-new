-- =====================================================================
-- SUPABASE #4 (ybzdpxwbpbkeqkqwbscp) — PHÒNG ĐẤU KÉO BÚA BAO
-- Chạy TAY trong SQL Editor của Supabase #4. KHÔNG chạy ở #1/#2/#3.
--
-- Luật đã chốt: 1 ván ăn ngay (hoà thì chơi lại ván đó), 30 giây/ván.
-- Xu vẫn nằm ở Supabase #1: bảng này chỉ GHI NHẬN kết quả + cờ đã
-- thanh toán; máy chủ đọc cờ đó rồi mới cộng/trừ Xu ở #1 đúng 1 lần.
-- Toàn bộ bảng/hàm chỉ service_role dùng được — frontend không gọi trực tiếp.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1) Bảng phòng đấu (thứ đang thiếu hoàn toàn trên #4)
-- ------------------------------------------------------------------
create table if not exists public.rps4_rooms (
  id            bigint generated always as identity primary key,
  challenge_id  uuid not null references public.rps_challenges(id) on delete cascade,
  player_a      uuid not null,               -- người thách đấu
  player_b      uuid not null,               -- người nhận lời
  stake         bigint not null check (stake > 0),
  status        text   not null default 'playing'
                check (status in ('playing','finished','cancelled')),
  round_no      int    not null default 1,
  move_a        text   check (move_a in ('rock','paper','scissors')),
  move_b        text   check (move_b in ('rock','paper','scissors')),
  deadline_at   timestamptz not null default now() + interval '30 seconds',
  winner_id     uuid,                        -- null + finished = hoà/huỷ
  result        text check (result in ('a_win','b_win','forfeit','timeout')),
  settled       boolean not null default false,  -- máy chủ đã chỉnh Xu ở #1 chưa
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  check (player_a <> player_b)
);

-- Một lời mời chỉ đẻ ra ĐÚNG MỘT phòng (chống nhận 2 lần → 2 phòng).
create unique index if not exists rps4_rooms_challenge_uniq
  on public.rps4_rooms (challenge_id);

-- Chống một người ở 2 phòng đang chơi.
create unique index if not exists rps4_rooms_active_a
  on public.rps4_rooms (player_a) where status = 'playing';
create unique index if not exists rps4_rooms_active_b
  on public.rps4_rooms (player_b) where status = 'playing';

create index if not exists rps4_rooms_players_idx
  on public.rps4_rooms (player_a, player_b, status);

alter table public.rps4_rooms enable row level security;
-- Không policy nào cho anon/authenticated: chỉ service_role (bypass RLS) đọc/ghi.
revoke all on public.rps4_rooms from anon, authenticated;
grant all on public.rps4_rooms to service_role;

-- Cập nhật tức thời để A tự vào phòng dù đã rời khung chat.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'rps4_rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rps4_rooms';
  end if;
end $$;
alter table public.rps4_rooms replica identity full;

-- ------------------------------------------------------------------
-- 2) Hàm trợ giúp: ai đang kẹt trong phòng đang chơi?
-- ------------------------------------------------------------------
create or replace function public.rps4_active_room(p_user uuid)
returns public.rps4_rooms
language sql stable security definer set search_path = public as $$
  select r.* from public.rps4_rooms r
  where r.status = 'playing' and (r.player_a = p_user or r.player_b = p_user)
  limit 1
$$;

-- ------------------------------------------------------------------
-- 3) NHẬN LỜI MỜI + TẠO PHÒNG THẬT trong cùng một giao dịch
--    (thay bản cũ chỉ đổi trạng thái rồi trả room_id rỗng)
-- ------------------------------------------------------------------
create or replace function public.rps4_accept_challenge(p_id uuid, p_user uuid)
returns public.rps_challenges
language plpgsql security definer set search_path = public as $$
declare
  c        public.rps_challenges;
  r        public.rps4_rooms;
  new_room bigint;
begin
  select * into c from public.rps_challenges where id = p_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if c.opponent_id <> p_user then
    raise exception 'NOT_INVITED' using errcode = 'P0001';
  end if;

  -- Đã nhận rồi → trả đúng phòng cũ (bấm 2 lần vẫn vào 1 phòng).
  if c.status = 'accepted' and c.room_id is not null then
    return c;
  end if;
  if c.status = 'cancelled' then
    raise exception 'CHALLENGE_CANCELLED' using errcode = 'P0001';
  end if;
  if c.status <> 'pending' then
    raise exception 'CHALLENGE_NOT_PENDING' using errcode = 'P0001';
  end if;
  if c.expires_at <= now() then
    update public.rps_challenges set status = 'expired' where id = c.id;
    raise exception 'CHALLENGE_EXPIRED' using errcode = 'P0001';
  end if;

  -- Không ai được ở 2 phòng đang chơi.
  if exists (
    select 1 from public.rps4_rooms
    where status = 'playing'
      and (player_a in (c.challenger_id, c.opponent_id)
        or player_b in (c.challenger_id, c.opponent_id))
  ) then
    raise exception 'ALREADY_IN_ROOM' using errcode = 'P0001';
  end if;

  insert into public.rps4_rooms (challenge_id, player_a, player_b, stake)
  values (c.id, c.challenger_id, c.opponent_id, c.stake)
  on conflict (challenge_id) do update set challenge_id = excluded.challenge_id
  returning * into r;
  new_room := r.id;

  update public.rps_challenges
     set status = 'accepted', accepted_at = now(), room_id = new_room
   where id = c.id
  returning * into c;

  return c;
end $$;

-- ------------------------------------------------------------------
-- 4) Đánh một nước + xử luôn kết quả ván (1 ván ăn ngay, hoà đánh lại)
-- ------------------------------------------------------------------
create or replace function public.rps4_play_move(p_room_id bigint, p_user uuid, p_move text)
returns public.rps4_rooms
language plpgsql security definer set search_path = public as $$
declare
  r     public.rps4_rooms;
  beats text;
begin
  if p_move not in ('rock','paper','scissors') then
    raise exception 'BAD_MOVE' using errcode = 'P0001';
  end if;

  select * into r from public.rps4_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if r.status <> 'playing' then raise exception 'ROOM_CLOSED' using errcode = 'P0001'; end if;
  if p_user not in (r.player_a, r.player_b) then
    raise exception 'NOT_A_PLAYER' using errcode = 'P0001';
  end if;

  -- Quá 30 giây: ai chưa đánh thì thua ván/trận.
  if r.deadline_at <= now() then
    return public.rps4_resolve_timeout(p_room_id);
  end if;

  if p_user = r.player_a then
    if r.move_a is not null then raise exception 'ALREADY_MOVED' using errcode = 'P0001'; end if;
    update public.rps4_rooms set move_a = p_move where id = r.id returning * into r;
  else
    if r.move_b is not null then raise exception 'ALREADY_MOVED' using errcode = 'P0001'; end if;
    update public.rps4_rooms set move_b = p_move where id = r.id returning * into r;
  end if;

  if r.move_a is null or r.move_b is null then
    return r;
  end if;

  if r.move_a = r.move_b then
    -- Hoà → đánh lại ván đó, đồng hồ 30 giây mới.
    update public.rps4_rooms
       set move_a = null, move_b = null,
           round_no = r.round_no + 1,
           deadline_at = now() + interval '30 seconds'
     where id = r.id returning * into r;
    return r;
  end if;

  beats := case r.move_a when 'rock' then 'scissors'
                         when 'paper' then 'rock'
                         else 'paper' end;

  update public.rps4_rooms
     set status = 'finished',
         finished_at = now(),
         winner_id = case when beats = r.move_b then r.player_a else r.player_b end,
         result    = case when beats = r.move_b then 'a_win' else 'b_win' end
   where id = r.id returning * into r;

  return r;
end $$;

-- ------------------------------------------------------------------
-- 5) Hết giờ → xử thua bên chưa đánh (cả hai chưa đánh = huỷ, hoàn Xu)
-- ------------------------------------------------------------------
create or replace function public.rps4_resolve_timeout(p_room_id bigint)
returns public.rps4_rooms
language plpgsql security definer set search_path = public as $$
declare r public.rps4_rooms;
begin
  select * into r from public.rps4_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if r.status <> 'playing' or r.deadline_at > now() then return r; end if;

  if r.move_a is null and r.move_b is null then
    update public.rps4_rooms
       set status='cancelled', finished_at=now(), result='timeout', winner_id=null
     where id=r.id returning * into r;
  else
    update public.rps4_rooms
       set status='finished', finished_at=now(), result='timeout',
           winner_id = case when r.move_a is not null then r.player_a else r.player_b end
     where id=r.id returning * into r;
  end if;
  return r;
end $$;

-- ------------------------------------------------------------------
-- 6) Thoát giữa chừng = xử thua
-- ------------------------------------------------------------------
create or replace function public.rps4_forfeit(p_room_id bigint, p_user uuid)
returns public.rps4_rooms
language plpgsql security definer set search_path = public as $$
declare r public.rps4_rooms;
begin
  select * into r from public.rps4_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_user not in (r.player_a, r.player_b) then
    raise exception 'NOT_A_PLAYER' using errcode = 'P0001';
  end if;
  if r.status <> 'playing' then return r; end if;

  update public.rps4_rooms
     set status='finished', finished_at=now(), result='forfeit',
         winner_id = case when p_user = r.player_a then r.player_b else r.player_a end
   where id = r.id returning * into r;
  return r;
end $$;

-- ------------------------------------------------------------------
-- 7) Đọc trạng thái phòng — giấu nước đi của đối thủ khi ván chưa ngã ngũ
-- ------------------------------------------------------------------
create or replace function public.rps4_room_state(p_room_id bigint, p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.rps4_rooms; reveal boolean;
begin
  select * into r from public.rps4_rooms where id = p_room_id;
  if not found then return null; end if;
  if p_user not in (r.player_a, r.player_b) then
    raise exception 'NOT_A_PLAYER' using errcode = 'P0001';
  end if;
  reveal := r.status <> 'playing';

  return jsonb_build_object(
    'id', r.id, 'challenge_id', r.challenge_id,
    'player_a', r.player_a, 'player_b', r.player_b,
    'stake', r.stake, 'status', r.status, 'round_no', r.round_no,
    'my_move',  case when p_user = r.player_a then r.move_a else r.move_b end,
    'opp_move', case when reveal then (case when p_user = r.player_a then r.move_b else r.move_a end) end,
    'opp_ready', case when p_user = r.player_a then r.move_b is not null else r.move_a is not null end,
    'deadline_at', r.deadline_at, 'winner_id', r.winner_id,
    'result', r.result, 'settled', r.settled, 'finished_at', r.finished_at
  );
end $$;

-- ------------------------------------------------------------------
-- 8) Chốt thanh toán: đánh dấu đúng MỘT lần để máy chủ chỉnh Xu ở #1
--    Trả về null nếu đã thanh toán rồi → không bao giờ trả thưởng 2 lần.
-- ------------------------------------------------------------------
create or replace function public.rps4_claim_settlement(p_room_id bigint)
returns public.rps4_rooms
language plpgsql security definer set search_path = public as $$
declare r public.rps4_rooms;
begin
  update public.rps4_rooms
     set settled = true
   where id = p_room_id and settled = false and status in ('finished','cancelled')
  returning * into r;
  return r;   -- null = chưa xong hoặc đã thanh toán rồi
end $$;

-- ------------------------------------------------------------------
-- 9) Quyền: chỉ máy chủ (service_role) được gọi
-- ------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'rps4_active_room(uuid)',
    'rps4_accept_challenge(uuid,uuid)',
    'rps4_play_move(bigint,uuid,text)',
    'rps4_resolve_timeout(bigint)',
    'rps4_forfeit(bigint,uuid)',
    'rps4_room_state(bigint,uuid)',
    'rps4_claim_settlement(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
