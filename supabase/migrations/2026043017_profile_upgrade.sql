-- =====================================================================
-- Profile Upgrade — Hybrid Facebook + Dating UX
-- Run this in Supabase SQL Editor for the project DB.
-- Idempotent: safe to re-run.
-- =====================================================================

-- 1) New columns on profiles ------------------------------------------------
alter table public.profiles
  add column if not exists height                    smallint,
  add column if not exists weight                    smallint,
  add column if not exists intent                    text,
  add column if not exists location_last_changed_at  timestamptz,
  add column if not exists location_change_count     integer not null default 0,
  add column if not exists profile_completed_bonus   boolean not null default false;

-- Constrain intent to allowed values (drop & re-add so it's idempotent).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'profiles_intent_check'
  ) then
    alter table public.profiles drop constraint profiles_intent_check;
  end if;
  alter table public.profiles
    add constraint profiles_intent_check
    check (intent is null or intent in ('fwb','ons','dating','serious'));
end$$;

-- 2) Location change history ----------------------------------------------
create table if not exists public.location_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  old_location  text,
  new_location  text,
  created_at    timestamptz not null default now()
);

create index if not exists location_history_user_idx
  on public.location_history (user_id, created_at desc);

alter table public.location_history enable row level security;

drop policy if exists "location_history_select_own" on public.location_history;
create policy "location_history_select_own"
  on public.location_history for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "location_history_insert_own" on public.location_history;
create policy "location_history_insert_own"
  on public.location_history for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 3) Server-side cooldown enforcement -------------------------------------
-- 60-day cooldown after the FIRST change unless vip_level >= 5.
create or replace function public.enforce_location_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_loc       text;
  v_new_loc       text;
  v_last_changed  timestamptz;
  v_count         integer;
  v_vip           integer;
begin
  v_old_loc := coalesce(old.province, old.location);
  v_new_loc := coalesce(new.province, new.location);

  -- Nothing relevant changed → allow.
  if v_old_loc is not distinct from v_new_loc then
    return new;
  end if;

  v_last_changed := old.location_last_changed_at;
  v_count        := coalesce(old.location_change_count, 0);
  v_vip          := coalesce(old.vip_level, 1);

  -- 2nd+ change within 60 days requires VIP >= 5.
  if v_count >= 1
     and v_last_changed is not null
     and (now() - v_last_changed) < interval '60 days'
     and v_vip < 5
  then
    raise exception 'LOCATION_COOLDOWN: Cần VIP 5 để đổi khu vực lần nữa'
      using errcode = 'P0001';
  end if;

  new.location_last_changed_at := now();
  new.location_change_count    := v_count + 1;

  -- Log history (best-effort).
  insert into public.location_history (user_id, old_location, new_location)
  values (new.id, v_old_loc, v_new_loc);

  return new;
end$$;

drop trigger if exists trg_enforce_location_cooldown on public.profiles;
create trigger trg_enforce_location_cooldown
  before update of province, location on public.profiles
  for each row
  execute function public.enforce_location_cooldown();

-- =====================================================================
-- Done. Verify with:
--   select column_name from information_schema.columns
--    where table_name='profiles' and column_name in
--    ('height','weight','intent','location_last_changed_at','location_change_count');
-- =====================================================================
