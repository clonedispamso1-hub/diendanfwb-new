-- =====================================================================
-- FWB Round 2 #2: Two-way connection requests (Friend-request style)
-- Chạy thủ công trong Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Idempotent: an toàn khi chạy lại.
-- =====================================================================

-- 1) connection_requests --------------------------------------------------
create table if not exists public.connection_requests (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid references auth.users(id) on delete cascade,
  to_demo_id   uuid,
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint cr_target_exactly_one check (
    (to_user is not null and to_demo_id is null) or
    (to_user is null and to_demo_id is not null)
  ),
  constraint cr_no_self check (from_user is distinct from to_user)
);

create unique index if not exists cr_real_pending_unique
  on public.connection_requests (from_user, to_user)
  where to_user is not null and status = 'pending';

create index if not exists cr_to_user_idx
  on public.connection_requests (to_user, status, created_at desc);
create index if not exists cr_from_user_idx
  on public.connection_requests (from_user, status, created_at desc);

-- 2) Grants (Data API) ----------------------------------------------------
grant select, insert, update on public.connection_requests to authenticated;
grant all on public.connection_requests to service_role;

-- 3) RLS ------------------------------------------------------------------
alter table public.connection_requests enable row level security;

drop policy if exists "cr_select_own"        on public.connection_requests;
drop policy if exists "cr_insert_from_self"  on public.connection_requests;
drop policy if exists "cr_update_receiver"   on public.connection_requests;

create policy "cr_select_own" on public.connection_requests
  for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

create policy "cr_insert_from_self" on public.connection_requests
  for insert to authenticated
  with check (auth.uid() = from_user);

create policy "cr_update_receiver" on public.connection_requests
  for update to authenticated
  using (auth.uid() = to_user)
  with check (auth.uid() = to_user);

-- 4) Helper RPC: 2 user đã accepted (match 2 chiều) chưa? ----------------
create or replace function public.is_connection_accepted(_a uuid, _b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.connection_requests
    where status = 'accepted'
      and (
        (from_user = _a and to_user = _b)
        or (from_user = _b and to_user = _a)
      )
  );
$$;

grant execute on function public.is_connection_accepted(uuid, uuid)
  to authenticated, anon;

-- 5) Trigger: cập nhật responded_at khi status đổi ----------------------
create or replace function public.cr_on_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status <> OLD.status and NEW.status in ('accepted','declined') then
    NEW.responded_at := now();
  end if;
  return NEW;
end$$;

drop trigger if exists cr_status_change on public.connection_requests;
create trigger cr_status_change
  before update on public.connection_requests
  for each row execute function public.cr_on_status_change();

-- 6) Trigger: khi tạo request → tạo notification cho receiver ------------
create or replace function public.cr_on_insert_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sender_name text;
begin
  if NEW.to_user is null then return NEW; end if;

  select coalesce(full_name, username, 'Một người dùng')
    into sender_name
    from public.profiles where id = NEW.from_user;

  begin
    insert into public.notifications (user_id, type, title, message, data, is_read)
    values (
      NEW.to_user,
      'connection_request',
      '💖 Yêu cầu kết nối mới',
      coalesce(sender_name,'Một người dùng') || ' muốn kết nối với bạn',
      jsonb_build_object('request_id', NEW.id, 'from_user', NEW.from_user),
      false
    );
  exception when others then
    null; -- schema notifications khác → bỏ qua
  end;
  return NEW;
end$$;

drop trigger if exists cr_insert_notify on public.connection_requests;
create trigger cr_insert_notify
  after insert on public.connection_requests
  for each row execute function public.cr_on_insert_notify();
