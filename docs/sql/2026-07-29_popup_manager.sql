-- ============================================================
-- Popup Manager + Maintenance Mode (idempotent)
-- Chạy trong Supabase SQL editor của project zbuwddjcqdlyijcunwgd
-- ============================================================

-- Enum popup type (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'popup_type') then
    create type public.popup_type as enum (
      'announcement','maintenance','promotion','event','warning','update','custom'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'popup_trigger') then
    create type public.popup_trigger as enum (
      'once','every_login','every_refresh','every_hours','every_days','manual'
    );
  end if;
end $$;

-- =========== TABLE: admin_popups ==============================
create table if not exists public.admin_popups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  image_url text,
  video_url text,
  button_text text,
  button_url text,
  bg_color text default '#ffffff',
  style text default 'center',        -- center | top | bottom | corner | fullscreen
  animation text default 'fade',      -- fade | zoom | slide-up | slide-down
  popup_type public.popup_type not null default 'announcement',
  status text not null default 'active',   -- active | scheduled | disabled
  priority int not null default 5,
  start_at timestamptz,
  end_at timestamptz,
  trigger_type public.popup_trigger not null default 'once',
  trigger_value int default 0,        -- hours or days depending on trigger
  dont_show_again_option text default '24h',  -- 24h | 3d | 7d | never | none
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_popups_status_priority_idx
  on public.admin_popups(status, priority desc);

-- =========== TABLE: admin_popup_events ========================
create table if not exists public.admin_popup_events (
  id bigserial primary key,
  popup_id uuid not null references public.admin_popups(id) on delete cascade,
  user_id uuid,
  session_key text,
  event_type text not null,   -- view | close | click | hidden_dsa
  created_at timestamptz not null default now()
);

create index if not exists admin_popup_events_popup_idx
  on public.admin_popup_events(popup_id, event_type);

-- =========== TABLE: admin_site_settings =======================
create table if not exists public.admin_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.admin_site_settings(key, value)
values ('maintenance', jsonb_build_object(
  'enabled', false,
  'title', 'Website đang bảo trì',
  'description', 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.',
  'logo_url', '',
  'bg_url', '',
  'eta', '',
  'progress', 0,
  'contact_url', ''
))
on conflict (key) do nothing;

-- =========== GRANTS ===========================================
grant select on public.admin_popups to anon, authenticated;
grant insert, update, delete on public.admin_popups to authenticated;
grant all on public.admin_popups to service_role;

grant select, insert on public.admin_popup_events to anon, authenticated;
grant all on public.admin_popup_events to service_role;
grant usage, select on sequence public.admin_popup_events_id_seq to anon, authenticated;

grant select on public.admin_site_settings to anon, authenticated;
grant insert, update on public.admin_site_settings to authenticated;
grant all on public.admin_site_settings to service_role;

-- =========== RLS ==============================================
alter table public.admin_popups enable row level security;
alter table public.admin_popup_events enable row level security;
alter table public.admin_site_settings enable row level security;

-- Helper: is admin (bangchu approved & active)
create or replace function public.is_admin(_uid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.bangchu
    where auth_user_id = _uid and status = 'approved' and is_active = true
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

do $$
begin
  -- admin_popups
  begin execute 'drop policy if exists popups_read_all on public.admin_popups'; exception when others then null; end;
  begin execute 'drop policy if exists popups_admin_write on public.admin_popups'; exception when others then null; end;
  begin execute 'drop policy if exists popups_admin_update on public.admin_popups'; exception when others then null; end;
  begin execute 'drop policy if exists popups_admin_delete on public.admin_popups'; exception when others then null; end;
end $$;

create policy popups_read_all on public.admin_popups
  for select to anon, authenticated using (true);

create policy popups_admin_write on public.admin_popups
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy popups_admin_update on public.admin_popups
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy popups_admin_delete on public.admin_popups
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- events: anyone can insert + read own; admin reads all
do $$
begin
  begin execute 'drop policy if exists popup_events_insert on public.admin_popup_events'; exception when others then null; end;
  begin execute 'drop policy if exists popup_events_select on public.admin_popup_events'; exception when others then null; end;
end $$;

create policy popup_events_insert on public.admin_popup_events
  for insert to anon, authenticated with check (true);

create policy popup_events_select on public.admin_popup_events
  for select to anon, authenticated using (true);

-- site settings
do $$
begin
  begin execute 'drop policy if exists site_settings_read on public.admin_site_settings'; exception when others then null; end;
  begin execute 'drop policy if exists site_settings_write on public.admin_site_settings'; exception when others then null; end;
end $$;

create policy site_settings_read on public.admin_site_settings
  for select to anon, authenticated using (true);

create policy site_settings_write on public.admin_site_settings
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =========== RPC: get_active_popups ===========================
create or replace function public.get_active_popups()
returns setof public.admin_popups
language sql stable security definer set search_path=public as $$
  select * from public.admin_popups
  where status = 'active'
    and (start_at is null or start_at <= now())
    and (end_at is null or end_at >= now())
  order by priority asc, created_at desc;
$$;

grant execute on function public.get_active_popups() to anon, authenticated;

-- =========== RPC: log_popup_event =============================
create or replace function public.log_popup_event(
  _popup_id uuid, _event text, _session text default null
) returns void language sql security definer set search_path=public as $$
  insert into public.admin_popup_events(popup_id, user_id, session_key, event_type)
  values (_popup_id, auth.uid(), _session, _event);
$$;

grant execute on function public.log_popup_event(uuid, text, text) to anon, authenticated;

-- =========== RPC: popup_stats =================================
create or replace function public.popup_stats(_popup_id uuid)
returns table(views bigint, closes bigint, clicks bigint, hidden bigint, unique_users bigint)
language sql stable security definer set search_path=public as $$
  select
    count(*) filter (where event_type='view'),
    count(*) filter (where event_type='close'),
    count(*) filter (where event_type='click'),
    count(*) filter (where event_type='hidden_dsa'),
    count(distinct coalesce(user_id::text, session_key))
  from public.admin_popup_events
  where popup_id = _popup_id;
$$;

grant execute on function public.popup_stats(uuid) to anon, authenticated;

-- updated_at trigger
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'admin_popups_touch') then
    create trigger admin_popups_touch before update on public.admin_popups
    for each row execute function public.tg_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'admin_site_settings_touch') then
    create trigger admin_site_settings_touch before update on public.admin_site_settings
    for each row execute function public.tg_touch_updated_at();
  end if;
end $$;
