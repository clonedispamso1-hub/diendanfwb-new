-- =====================================================================
-- BANG CHU / ADMIN SYSTEM - Tách hoàn toàn khỏi user thường
-- Chạy file này trong Supabase SQL Editor (1 lần) để fix lỗi enum
-- "invalid input value for enum admin_role: admin_2" và dựng toàn bộ
-- hệ thống admin theo kiến trúc mới.
-- =====================================================================

-- 1) ENUMS riêng cho hệ thống bangchu (không động vào enum cũ admin_role)
do $$ begin
  create type public.bangchu_role as enum ('admin_1','admin_2','agent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bangchu_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

alter type public.bangchu_role  add value if not exists 'admin_1';
alter type public.bangchu_role  add value if not exists 'admin_2';
alter type public.bangchu_role  add value if not exists 'agent';
alter type public.bangchu_status add value if not exists 'pending';
alter type public.bangchu_status add value if not exists 'approved';
alter type public.bangchu_status add value if not exists 'rejected';

-- 2) BẢNG bangchu
create table if not exists public.bangchu (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  username      text not null unique,
  role          public.bangchu_role   not null default 'agent',
  status        public.bangchu_status not null default 'pending',
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  approved_by   uuid references auth.users(id),
  approved_at   timestamptz,
  constraint bangchu_username_format check (username ~ '^[A-Za-z0-9_]{6,30}$')
);

create index if not exists bangchu_status_idx on public.bangchu(status);
create index if not exists bangchu_role_idx   on public.bangchu(role);

grant select, insert, update, delete on public.bangchu to authenticated;
grant all on public.bangchu to service_role;

alter table public.bangchu enable row level security;

-- 3) SECURITY DEFINER helpers (tránh đệ quy RLS)
create or replace function public.has_bangchu_role(_user uuid, _role public.bangchu_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.bangchu
    where auth_user_id = _user
      and role = _role
      and status = 'approved'
      and is_active = true
  );
$$;

create or replace function public.is_active_bangchu(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.bangchu
    where auth_user_id = _user
      and status = 'approved'
      and is_active = true
  );
$$;

-- 4) RLS POLICIES
drop policy if exists "self read"             on public.bangchu;
drop policy if exists "admin_1 read all"      on public.bangchu;
drop policy if exists "self register pending" on public.bangchu;
drop policy if exists "admin_1 update all"    on public.bangchu;
drop policy if exists "admin_1 delete"        on public.bangchu;

create policy "self read" on public.bangchu for select to authenticated
  using (auth_user_id = auth.uid());

create policy "admin_1 read all" on public.bangchu for select to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'));

create policy "self register pending" on public.bangchu for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and status    = 'pending'
    and is_active = false
    and role      = 'admin_2'
  );

create policy "admin_1 update all" on public.bangchu for update to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'))
  with check (public.has_bangchu_role(auth.uid(), 'admin_1'));

create policy "admin_1 delete" on public.bangchu for delete to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'));

-- 5) RPC duyệt / từ chối / khoá / mở khoá / đổi role / xoá
create or replace function public.approve_bangchu(_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if not public.has_bangchu_role(_me, 'admin_1') then
    raise exception 'forbidden: only admin_1 may approve';
  end if;
  update public.bangchu
     set status='approved', is_active=true,
         approved_by=_me, approved_at=now()
   where id=_target;
end $$;

create or replace function public.reject_bangchu(_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if not public.has_bangchu_role(_me, 'admin_1') then
    raise exception 'forbidden: only admin_1 may reject';
  end if;
  update public.bangchu
     set status='rejected', is_active=false,
         approved_by=_me, approved_at=now()
   where id=_target;
end $$;

create or replace function public.lock_bangchu(_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _trg public.bangchu;
begin
  if not public.has_bangchu_role(_me, 'admin_1') then raise exception 'forbidden'; end if;
  select * into _trg from public.bangchu where id=_target;
  if _trg.role = 'admin_1' then raise exception 'cannot lock admin_1'; end if;
  update public.bangchu set is_active=false where id=_target;
end $$;

create or replace function public.unlock_bangchu(_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if not public.has_bangchu_role(_me, 'admin_1') then raise exception 'forbidden'; end if;
  update public.bangchu set is_active=true where id=_target and status='approved';
end $$;

create or replace function public.change_bangchu_role(_target uuid, _role public.bangchu_role)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _trg public.bangchu;
begin
  if not public.has_bangchu_role(_me, 'admin_1') then raise exception 'forbidden'; end if;
  select * into _trg from public.bangchu where id=_target;
  if _trg.role = 'admin_1' and _role <> 'admin_1' then
    if (select count(*) from public.bangchu where role='admin_1' and is_active=true) <= 1 then
      raise exception 'cannot demote the last admin_1';
    end if;
  end if;
  update public.bangchu set role=_role where id=_target;
end $$;

create or replace function public.delete_bangchu(_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _trg public.bangchu;
begin
  if not public.has_bangchu_role(_me, 'admin_1') then raise exception 'forbidden'; end if;
  select * into _trg from public.bangchu where id=_target;
  if _trg.role = 'admin_1' then raise exception 'cannot delete admin_1'; end if;
  delete from public.bangchu where id=_target;
end $$;

grant execute on function public.approve_bangchu(uuid)        to authenticated;
grant execute on function public.reject_bangchu(uuid)         to authenticated;
grant execute on function public.lock_bangchu(uuid)           to authenticated;
grant execute on function public.unlock_bangchu(uuid)         to authenticated;
grant execute on function public.change_bangchu_role(uuid, public.bangchu_role) to authenticated;
grant execute on function public.delete_bangchu(uuid)         to authenticated;
grant execute on function public.has_bangchu_role(uuid, public.bangchu_role)    to authenticated;
grant execute on function public.is_active_bangchu(uuid)      to authenticated;

-- =====================================================================
-- 6) BOOTSTRAP BANG CHỦ ĐẦU TIÊN
--    a) Vào /admin/register trên website, đăng ký username + mật khẩu
--    b) Quay lại đây, thay 'BangChu_01' bằng username vừa đăng ký, chạy:
--
-- update public.bangchu
--    set role='admin_1', status='approved', is_active=true, approved_at=now()
--  where username='BangChu_01';
-- =====================================================================
