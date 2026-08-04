-- ============================================================
-- FIX: new row violates row-level security policy
--      for table public.admin_site_settings
-- Idempotent. RLS stays ENABLED. No URL/key change.
-- Run in Supabase SQL editor of project zbuwddjcqdlyijcunwgd.
-- ============================================================

-- 1) Table (safety net, idempotent) --------------------------
create table if not exists public.admin_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.admin_site_settings enable row level security;

-- 2) Grants ---------------------------------------------------
grant select on public.admin_site_settings to anon, authenticated;
grant insert, update on public.admin_site_settings to authenticated;
grant all on public.admin_site_settings to service_role;

-- 3) Admin helper (bangchu approved + active) -----------------
create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bangchu
    where auth_user_id = _uid
      and status = 'approved'
      and is_active = true
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

-- 4) Policies: separate SELECT / INSERT / UPDATE so that
--    upsert() (INSERT ... ON CONFLICT DO UPDATE) passes both
--    the INSERT WITH CHECK and the UPDATE USING+WITH CHECK.
drop policy if exists site_settings_read           on public.admin_site_settings;
drop policy if exists site_settings_write          on public.admin_site_settings;
drop policy if exists site_settings_admin_insert   on public.admin_site_settings;
drop policy if exists site_settings_admin_update   on public.admin_site_settings;
drop policy if exists site_settings_admin_delete   on public.admin_site_settings;

create policy site_settings_read
  on public.admin_site_settings
  for select to anon, authenticated
  using (true);

create policy site_settings_admin_insert
  on public.admin_site_settings
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy site_settings_admin_update
  on public.admin_site_settings
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy site_settings_admin_delete
  on public.admin_site_settings
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- 5) SECURITY DEFINER RPC — preferred write path --------------
--    Verifies the caller is an admin, then upserts. Avoids any
--    RLS edge case with ON CONFLICT.
create or replace function public.admin_set_site_setting(
  _key text,
  _value jsonb
)
returns public.admin_site_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _row public.admin_site_settings;
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED: no session token sent with the request'
      using errcode = '42501';
  end if;

  if not public.is_admin(_uid) then
    raise exception 'FORBIDDEN: user % is not an approved active admin', _uid
      using errcode = '42501';
  end if;

  insert into public.admin_site_settings as s (key, value, updated_at, updated_by)
  values (_key, coalesce(_value, '{}'::jsonb), now(), _uid)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = excluded.updated_by
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.admin_set_site_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_site_setting(text, jsonb) to authenticated;

-- 6) Public read RPC (maintenance page works while logged out) -
create or replace function public.get_site_setting(_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.admin_site_settings where key = _key;
$$;

grant execute on function public.get_site_setting(text) to anon, authenticated;

-- 7) Default maintenance row ----------------------------------
insert into public.admin_site_settings(key, value)
values ('maintenance', jsonb_build_object(
  'enabled', false,
  'title', 'Website đang bảo trì',
  'description', 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.',
  'image_url', '',
  'eta', '',
  'progress', 0,
  'contact_url', ''
))
on conflict (key) do nothing;

-- 8) updated_at trigger ---------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'admin_site_settings_touch') then
    create trigger admin_site_settings_touch
      before update on public.admin_site_settings
      for each row execute function public.tg_touch_updated_at();
  end if;
end $$;
