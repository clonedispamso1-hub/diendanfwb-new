-- ============================================================
-- SUPABASE #4 — "Tìm Xung Quanh": CHIẾM GIỮ TỌA ĐỘ 7 NGÀY.
-- Chạy 1 lần trong SQL Editor. An toàn khi chạy lại (idempotent).
-- ============================================================

create table if not exists public.map_coordinates (
  pin_id text primary key,
  is_occupied boolean not null default false,
  occupied_by_user_id uuid,
  -- Tài khoản thứ hai / hồ sơ hiển thị (UID dạng text) + thông tin hiển thị.
  occupied_by_uid text,
  occupant_name text,
  occupant_avatar text,
  occupied_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.map_coordinates add column if not exists is_occupied boolean not null default false;
alter table public.map_coordinates add column if not exists occupied_by_user_id uuid;
alter table public.map_coordinates add column if not exists occupied_by_uid text;
alter table public.map_coordinates add column if not exists occupant_name text;
alter table public.map_coordinates add column if not exists occupant_avatar text;
alter table public.map_coordinates add column if not exists occupied_at timestamptz;
alter table public.map_coordinates add column if not exists expires_at timestamptz;

create index if not exists map_coordinates_expires_idx on public.map_coordinates (expires_at);

grant select on public.map_coordinates to anon, authenticated;
grant insert, update, delete on public.map_coordinates to anon, authenticated;
grant all on public.map_coordinates to service_role;

alter table public.map_coordinates enable row level security;

drop policy if exists "map_coordinates read" on public.map_coordinates;
create policy "map_coordinates read" on public.map_coordinates for select using (true);

drop policy if exists "map_coordinates write" on public.map_coordinates;
create policy "map_coordinates write" on public.map_coordinates for all using (true) with check (true);

-- ------------------------------------------------------------
-- 1) Giải phóng mọi tọa độ đã hết hạn 7 ngày.
-- ------------------------------------------------------------
create or replace function public.nearby_release_expired_coordinates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.map_coordinates
     set is_occupied = false,
         occupied_by_user_id = null,
         occupied_by_uid = null,
         occupant_name = null,
         occupant_avatar = null,
         occupied_at = null,
         expires_at = null,
         updated_at = now()
   where is_occupied = true
     and expires_at is not null
     and now() >= expires_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.nearby_release_expired_coordinates() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2) Chiếm giữ 1 tọa độ trong 7 ngày (bỏ qua nếu đang bị chiếm).
-- ------------------------------------------------------------
create or replace function public.nearby_occupy_coordinate(
  p_pin_id text,
  p_user_id uuid default null,
  p_uid text default null,
  p_name text default null,
  p_avatar text default null
)
returns public.map_coordinates
language plpgsql
security definer
set search_path = public
as $$
declare row public.map_coordinates;
begin
  perform public.nearby_release_expired_coordinates();

  insert into public.map_coordinates as m (
    pin_id, is_occupied, occupied_by_user_id, occupied_by_uid,
    occupant_name, occupant_avatar, occupied_at, expires_at, updated_at
  ) values (
    p_pin_id, true, p_user_id, p_uid,
    p_name, p_avatar, now(), now() + interval '7 days', now()
  )
  on conflict (pin_id) do update
    set is_occupied = true,
        occupied_by_user_id = excluded.occupied_by_user_id,
        occupied_by_uid = excluded.occupied_by_uid,
        occupant_name = excluded.occupant_name,
        occupant_avatar = excluded.occupant_avatar,
        occupied_at = now(),
        expires_at = now() + interval '7 days',
        updated_at = now()
    where m.is_occupied = false
       or m.expires_at is null
       or now() >= m.expires_at
  returning * into row;

  if row.pin_id is null then
    select * into row from public.map_coordinates where pin_id = p_pin_id;
  end if;
  return row;
end;
$$;

grant execute on function public.nearby_occupy_coordinate(text, uuid, text, text, text)
  to anon, authenticated, service_role;
