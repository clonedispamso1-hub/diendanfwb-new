-- ============================================================
-- RUN NOW — FIX: new row violates row-level security policy
--           for table public.admin_site_settings
--
-- Chạy toàn bộ file này trong Supabase SQL Editor của project
-- zbuwddjcqdlyijcunwgd (DB cũ). Idempotent — chạy lại nhiều lần OK.
--
-- Sau khi chạy: frontend CHỈ gọi RPC save_admin_site_settings(...)
-- (SECURITY DEFINER) nên không còn đụng RLS khi ghi.
-- ============================================================

-- 1) Bảng ------------------------------------------------------
create table if not exists public.admin_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.admin_site_settings enable row level security;

-- 2) Grants ----------------------------------------------------
grant select on public.admin_site_settings to anon, authenticated;
grant insert, update on public.admin_site_settings to authenticated;
grant all on public.admin_site_settings to service_role;

-- 3) Helper quyền admin: bangchu (approved+active) HOẶC profiles.is_admin
create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select true
       from public.bangchu
      where auth_user_id = _uid
        and status = 'approved'
        and is_active = true
      limit 1),
    (select p.is_admin
       from public.profiles p
      where p.id = _uid
      limit 1),
    false
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

-- 4) Policies tách riêng SELECT / INSERT / UPDATE / DELETE ------
drop policy if exists site_settings_read         on public.admin_site_settings;
drop policy if exists site_settings_write        on public.admin_site_settings;
drop policy if exists site_settings_admin_insert on public.admin_site_settings;
drop policy if exists site_settings_admin_update on public.admin_site_settings;
drop policy if exists site_settings_admin_delete on public.admin_site_settings;

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

-- 5) RPC GHI DUY NHẤT (SECURITY DEFINER) -----------------------
--    Có record  -> UPDATE. Chưa có -> INSERT.
create or replace function public.save_admin_site_settings(
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
  if _key is null or length(btrim(_key)) = 0 then
    raise exception 'INVALID_KEY' using errcode = '22023';
  end if;

  if _uid is null then
    raise exception 'AUTH_REQUIRED: chưa gửi phiên đăng nhập'
      using errcode = '42501';
  end if;

  if not public.is_admin(_uid) then
    raise exception 'FORBIDDEN: tài khoản % không phải admin', _uid
      using errcode = '42501';
  end if;

  update public.admin_site_settings
     set value = coalesce(_value, '{}'::jsonb),
         updated_at = now(),
         updated_by = _uid
   where key = _key
  returning * into _row;

  if not found then
    insert into public.admin_site_settings (key, value, updated_at, updated_by)
    values (_key, coalesce(_value, '{}'::jsonb), now(), _uid)
    on conflict (key) do update
      set value = excluded.value,
          updated_at = now(),
          updated_by = excluded.updated_by
    returning * into _row;
  end if;

  return _row;
end;
$$;

revoke all on function public.save_admin_site_settings(text, jsonb) from public, anon;
grant execute on function public.save_admin_site_settings(text, jsonb) to authenticated;

-- Giữ tên cũ admin_set_site_setting làm alias (code cũ vẫn chạy).
create or replace function public.admin_set_site_setting(
  _key text,
  _value jsonb
)
returns public.admin_site_settings
language sql
security definer
set search_path = public
as $$
  select public.save_admin_site_settings(_key, _value);
$$;

revoke all on function public.admin_set_site_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_site_setting(text, jsonb) to authenticated;

-- 6) Đọc public ------------------------------------------------
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

-- 7) Seed các key dùng chung (không ghi đè dữ liệu đang có) -----
insert into public.admin_site_settings(key, value) values
  ('vip_unlock_popup', '{}'::jsonb),
  ('vip_contact_link', '{}'::jsonb),
  ('assistant_config', '{}'::jsonb)
on conflict (key) do nothing;

-- 8) Trigger updated_at ----------------------------------------
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


-- ============================================================
-- PHỤ LỤC 2026-08-26 — FIX lỗi "save_admin_site_settings" (Media VIP)
--
-- ⚠️ CHẠY TRÊN DB NÀO:
--   Supabase #1 (core/auth/admin) — project ref: gxfxqbhxoghdhokwjpex
--   URL: https://gxfxqbhxoghdhokwjpex.supabase.co  → SQL Editor
--   (Đây là DB mà `admin_site_settings` được đọc/ghi: MODULE_DB.admin = primary
--    trong src/lib/db/config.ts. Nếu trước đây bạn chỉ chạy file này trên
--    project zbuwddjcqdlyijcunwgd thì RPC KHÔNG tồn tại ở DB đang dùng → lỗi.)
--   Toàn bộ file idempotent — chạy lại nhiều lần đều an toàn.
-- ============================================================

-- 1) Xoá các overload cũ sai tên tham số (nguyên nhân PGRST202 khi frontend
--    gọi bằng _key/_value). Chỉ xoá bản có tham số p_key/p_value.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('save_admin_site_settings','admin_set_site_setting')
       and pg_get_function_identity_arguments(p.oid) ilike '%p_key%'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- 2) Seed các key của Media VIP (sticker quanh avatar + icon sau tên).
insert into public.admin_site_settings(key, value) values
  ('profile_stickers', '{"items":[],"assign":{}}'::jsonb)
on conflict (key) do nothing;

-- 3) Bảo đảm quyền EXECUTE (nếu grant bị mất sau restore/backup).
grant execute on function public.save_admin_site_settings(text, jsonb) to authenticated;
grant execute on function public.admin_set_site_setting(text, jsonb) to authenticated;
grant execute on function public.get_site_setting(text) to anon, authenticated;

-- 4) Kiểm tra nhanh (phải trả về 3 dòng).
-- select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname='public'
--    and p.proname in ('save_admin_site_settings','admin_set_site_setting','get_site_setting');
