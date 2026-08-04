-- ============================================================
-- HỆ THỐNG "KẾT NỐI": Bao lì xì mỗi ngày + Quét kết nối
-- Chạy 1 lần trong Supabase SQL Editor (Supabase #1 - DB hiện tại).
-- Raw SQL, KHÔNG escape $$.
-- ============================================================

-- ------------------------------------------------------------
-- 1) BẢNG CẤU HÌNH (Admin chỉnh, không cần sửa code)
-- ------------------------------------------------------------
create table if not exists public.connect_settings (
  id smallint primary key default 1,
  packet_count       integer not null default 28,   -- số bao lì xì xuất hiện
  fall_speed         numeric not null default 190,  -- tốc độ rơi (px/giây)
  fall_speed_jitter  numeric not null default 70,   -- dao động tốc độ
  spawn_gap_ms       integer not null default 260,  -- khoảng cách rơi (ms giữa 2 bao)
  duration_sec       integer not null default 9,    -- thời gian sự kiện
  cooldown_hours     integer not null default 24,   -- thời gian hồi
  reward_min         numeric not null default 0.3,  -- số lượt tối thiểu
  reward_max         numeric not null default 3.0,  -- số lượt tối đa
  -- xác suất phần thưởng: mảng [{"value":0.9,"weight":40}, ...]
  reward_table       jsonb   not null default
    '[{"value":0.6,"weight":25},{"value":0.9,"weight":30},{"value":1.2,"weight":20},{"value":1.8,"weight":15},{"value":2.4,"weight":8},{"value":3.0,"weight":2}]'::jsonb,
  scan_costs         jsonb   not null default '{"3":0.5,"5":1.0,"10":2.0}'::jsonb,
  enabled            boolean not null default true,
  updated_at         timestamptz not null default now(),
  constraint connect_settings_singleton check (id = 1)
);

insert into public.connect_settings (id) values (1) on conflict (id) do nothing;

grant select on public.connect_settings to anon, authenticated;
grant all on public.connect_settings to service_role;
alter table public.connect_settings enable row level security;

drop policy if exists "connect_settings_read" on public.connect_settings;
create policy "connect_settings_read" on public.connect_settings
  for select to anon, authenticated using (true);

drop policy if exists "connect_settings_admin_write" on public.connect_settings;
create policy "connect_settings_admin_write" on public.connect_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- ------------------------------------------------------------
-- 2) VÍ LƯỢT QUÉT
-- ------------------------------------------------------------
create table if not exists public.connect_scan_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits numeric(8,1) not null default 0,
  updated_at timestamptz not null default now()
);

grant select on public.connect_scan_credits to authenticated;
grant all on public.connect_scan_credits to service_role;
alter table public.connect_scan_credits enable row level security;

drop policy if exists "scan_credits_own_read" on public.connect_scan_credits;
create policy "scan_credits_own_read" on public.connect_scan_credits
  for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3) PHIÊN BAO LÌ XÌ (giới hạn 1 sự kiện / 24 giờ)
-- ------------------------------------------------------------
create table if not exists public.connect_lixi_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  collected integer,
  reward numeric(8,1)
);

create index if not exists connect_lixi_user_started_idx
  on public.connect_lixi_sessions (user_id, started_at desc);

grant select on public.connect_lixi_sessions to authenticated;
grant all on public.connect_lixi_sessions to service_role;
alter table public.connect_lixi_sessions enable row level security;

drop policy if exists "lixi_own_read" on public.connect_lixi_sessions;
create policy "lixi_own_read" on public.connect_lixi_sessions
  for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 4) LỊCH SỬ QUÉT (tránh lặp cùng 1 tài khoản) + GIỮ CHUỖI
-- ------------------------------------------------------------
create table if not exists public.connect_scan_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists connect_scan_hist_idx
  on public.connect_scan_history (user_id, created_at desc);

create table if not exists public.connect_streaks (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);

grant select on public.connect_scan_history to authenticated;
grant all on public.connect_scan_history to service_role;
grant select, insert, delete on public.connect_streaks to authenticated;
grant all on public.connect_streaks to service_role;

alter table public.connect_scan_history enable row level security;
alter table public.connect_streaks enable row level security;

drop policy if exists "scan_hist_own" on public.connect_scan_history;
create policy "scan_hist_own" on public.connect_scan_history
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "streaks_own_read" on public.connect_streaks;
create policy "streaks_own_read" on public.connect_streaks
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "streaks_own_write" on public.connect_streaks;
create policy "streaks_own_write" on public.connect_streaks
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "streaks_own_delete" on public.connect_streaks;
create policy "streaks_own_delete" on public.connect_streaks
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5) RPC: TRẠNG THÁI KẾT NỐI (config + credits + cooldown)
-- ------------------------------------------------------------
create or replace function public.connect_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.connect_settings;
  last_at timestamptz;
  cred numeric := 0;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into cfg from public.connect_settings where id = 1;

  select max(started_at) into last_at
  from public.connect_lixi_sessions
  where user_id = uid;

  select credits into cred from public.connect_scan_credits where user_id = uid;

  return jsonb_build_object(
    'enabled', cfg.enabled,
    'credits', coalesce(cred, 0),
    'duration_sec', cfg.duration_sec,
    'packet_count', cfg.packet_count,
    'fall_speed', cfg.fall_speed,
    'fall_speed_jitter', cfg.fall_speed_jitter,
    'spawn_gap_ms', cfg.spawn_gap_ms,
    'cooldown_hours', cfg.cooldown_hours,
    'scan_costs', cfg.scan_costs,
    'next_available_at',
      case when last_at is null then null
           else last_at + make_interval(hours => cfg.cooldown_hours) end,
    'can_play',
      cfg.enabled and (last_at is null
        or now() >= last_at + make_interval(hours => cfg.cooldown_hours))
  );
end;
$$;

grant execute on function public.connect_state() to authenticated;

-- ------------------------------------------------------------
-- 6) RPC: BẮT ĐẦU PHIÊN BAO LÌ XÌ
-- ------------------------------------------------------------
create or replace function public.connect_start_lixi()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.connect_settings;
  last_at timestamptz;
  sid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into cfg from public.connect_settings where id = 1;
  if not cfg.enabled then raise exception 'EVENT_DISABLED'; end if;

  select max(started_at) into last_at
  from public.connect_lixi_sessions where user_id = uid;

  if last_at is not null
     and now() < last_at + make_interval(hours => cfg.cooldown_hours) then
    raise exception 'COOLDOWN';
  end if;

  insert into public.connect_lixi_sessions (user_id)
  values (uid) returning id into sid;

  return jsonb_build_object(
    'session_id', sid,
    'duration_sec', cfg.duration_sec,
    'packet_count', cfg.packet_count,
    'fall_speed', cfg.fall_speed,
    'fall_speed_jitter', cfg.fall_speed_jitter,
    'spawn_gap_ms', cfg.spawn_gap_ms
  );
end;
$$;

grant execute on function public.connect_start_lixi() to authenticated;

-- ------------------------------------------------------------
-- 7) RPC: KẾT THÚC PHIÊN — tính thưởng theo xác suất + cộng lượt
-- ------------------------------------------------------------
create or replace function public.connect_finish_lixi(p_session uuid, p_collected integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.connect_settings;
  sess public.connect_lixi_sessions;
  total_w numeric := 0;
  roll numeric;
  acc numeric := 0;
  item jsonb;
  reward numeric := 0;
  bonus numeric := 0;
  new_credits numeric;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into sess from public.connect_lixi_sessions
  where id = p_session and user_id = uid;
  if sess.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if sess.finished_at is not null then
    return jsonb_build_object('collected', sess.collected, 'reward', sess.reward, 'replay', true);
  end if;

  select * into cfg from public.connect_settings where id = 1;

  -- chống gian lận: không thể nhặt nhiều hơn số bao xuất hiện
  p_collected := greatest(0, least(coalesce(p_collected, 0), cfg.packet_count));

  select coalesce(sum((e->>'weight')::numeric), 0) into total_w
  from jsonb_array_elements(cfg.reward_table) e;

  if total_w > 0 then
    roll := random() * total_w;
    for item in select e from jsonb_array_elements(cfg.reward_table) e loop
      acc := acc + (item->>'weight')::numeric;
      if roll <= acc then
        reward := (item->>'value')::numeric;
        exit;
      end if;
    end loop;
  end if;

  -- nhặt càng nhiều càng tốt: hệ số theo tỉ lệ nhặt được
  if cfg.packet_count > 0 then
    bonus := reward * (p_collected::numeric / cfg.packet_count::numeric);
  end if;
  reward := round((reward * 0.5 + bonus)::numeric, 1);
  reward := least(greatest(reward, cfg.reward_min), cfg.reward_max);

  insert into public.connect_scan_credits as c (user_id, credits)
  values (uid, reward)
  on conflict (user_id) do update
    set credits = round((c.credits + excluded.credits)::numeric, 1),
        updated_at = now()
  returning c.credits into new_credits;

  update public.connect_lixi_sessions
  set finished_at = now(), collected = p_collected, reward = reward
  where id = p_session;

  return jsonb_build_object('collected', p_collected, 'reward', reward, 'credits', new_credits);
end;
$$;

grant execute on function public.connect_finish_lixi(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 8) RPC: QUÉT KẾT NỐI — trả về 01 tài khoản clone NỮ phù hợp
-- ------------------------------------------------------------
create or replace function public.connect_scan(p_duration integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg public.connect_settings;
  cost numeric;
  cred numeric := 0;
  my_lat numeric; my_lng numeric; my_prov text;
  rec record;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into cfg from public.connect_settings where id = 1;
  cost := coalesce((cfg.scan_costs ->> p_duration::text)::numeric, 1.0);

  select credits into cred from public.connect_scan_credits where user_id = uid;
  cred := coalesce(cred, 0);
  if cred < cost then raise exception 'NOT_ENOUGH_CREDITS'; end if;

  select province into my_prov from public.profiles where id = uid;
  begin
    select latitude, longitude into my_lat, my_lng
    from public.user_locations where user_id = uid;
  exception when undefined_table then
    my_lat := null; my_lng := null;
  end;

  select
    p.id, p.full_name, p.username, p.avatar, p.age, p.province, p.is_online, p.last_seen,
    case
      when my_lat is not null and l.latitude is not null then
        round((6371 * acos(least(1, greatest(-1,
          cos(radians(my_lat)) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians(my_lng)) +
          sin(radians(my_lat)) * sin(radians(l.latitude))
        ))))::numeric, 1)
      else null
    end as distance_km
  into rec
  from public.profiles p
  left join public.user_locations l on l.user_id = p.id
  where p.id <> uid
    and lower(coalesce(p.gender, '')) in ('female', 'nữ', 'nu', 'f')
    and (p.is_seed_account = true or p.is_clone = true)
    and not exists (
      select 1 from public.connect_scan_history h
      where h.user_id = uid and h.target_id = p.id
        and h.created_at > now() - interval '6 hours'
    )
  order by
    -- ưu tiên: giữ chuỗi > cùng khu vực > gần khu vực > online gần đây > ngẫu nhiên
    (exists (select 1 from public.connect_streaks s where s.user_id = uid and s.target_id = p.id)) desc,
    (my_prov is not null and p.province = my_prov) desc,
    coalesce(
      case when my_lat is not null and l.latitude is not null then
        6371 * acos(least(1, greatest(-1,
          cos(radians(my_lat)) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians(my_lng)) +
          sin(radians(my_lat)) * sin(radians(l.latitude))
        )))
      else null end, 9999) asc,
    coalesce(p.last_seen, to_timestamp(0)) desc,
    random()
  limit 1;

  if rec.id is null then
    raise exception 'NO_MATCH';
  end if;

  update public.connect_scan_credits
  set credits = round((credits - cost)::numeric, 1), updated_at = now()
  where user_id = uid;

  insert into public.connect_scan_history (user_id, target_id) values (uid, rec.id);

  return jsonb_build_object(
    'id', rec.id,
    'full_name', rec.full_name,
    'username', rec.username,
    'avatar', rec.avatar,
    'age', rec.age,
    'province', rec.province,
    'is_online', rec.is_online,
    'distance_km', rec.distance_km,
    'cost', cost,
    'credits', (select credits from public.connect_scan_credits where user_id = uid)
  );
end;
$$;

grant execute on function public.connect_scan(integer) to authenticated;

-- ------------------------------------------------------------
-- 9) Dọn lịch sử quét cũ (giữ DB nhẹ)
-- ------------------------------------------------------------
create or replace function public.purge_old_connect_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare deleted integer;
begin
  delete from public.connect_scan_history where created_at < now() - interval '7 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.purge_old_connect_history() from public, anon, authenticated;
