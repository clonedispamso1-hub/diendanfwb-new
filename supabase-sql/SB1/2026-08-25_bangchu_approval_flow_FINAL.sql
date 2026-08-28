-- =====================================================================
-- BANGCHU APPROVAL FLOW — FINAL (chạy trên SUPABASE #1 - core)
-- Supabase #1: https://gxfxqbhxoghdhokwjpex.supabase.co
--
-- Flow: Đăng ký → PENDING → Admin (admin_1) phê duyệt + CHỌN ROLE
--       → APPROVED + ACTIVE → Đăng nhập Admin Panel.
--
-- Nguyên tắc:
--   • Mật khẩu KHÔNG lưu trong bảng bangchu — chỉ nằm ở Supabase Auth.
--   • Người đăng ký KHÔNG tự chọn role: policy insert ép role='agent'
--     (placeholder), status='pending', is_active=false.
--   • Chỉ admin_1 duyệt/từ chối/khoá/đổi role/xoá (RPC security definer).
--
-- File này IDEMPOTENT — chạy lại bao nhiêu lần cũng an toàn.
-- =====================================================================

-- 1) ENUMS ----------------------------------------------------------------
do $$ begin
  create type public.bangchu_role as enum ('admin_1','admin_2','agent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bangchu_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

alter type public.bangchu_role   add value if not exists 'admin_1';
alter type public.bangchu_role   add value if not exists 'admin_2';
alter type public.bangchu_role   add value if not exists 'agent';
alter type public.bangchu_status add value if not exists 'pending';
alter type public.bangchu_status add value if not exists 'approved';
alter type public.bangchu_status add value if not exists 'rejected';

-- 2) BẢNG bangchu ----------------------------------------------------------
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

-- Phòng trường hợp bảng đã tồn tại từ bản cũ mà thiếu cột.
alter table public.bangchu add column if not exists approved_by uuid references auth.users(id);
alter table public.bangchu add column if not exists approved_at timestamptz;
alter table public.bangchu alter column role       set default 'agent';
alter table public.bangchu alter column status     set default 'pending';
alter table public.bangchu alter column is_active  set default false;

create index if not exists bangchu_status_idx on public.bangchu(status);
create index if not exists bangchu_role_idx   on public.bangchu(role);

grant select, insert, update, delete on public.bangchu to authenticated;
grant all on public.bangchu to service_role;

alter table public.bangchu enable row level security;

-- 3) SECURITY DEFINER helpers (tránh đệ quy RLS) ---------------------------
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

-- 4) RLS POLICIES ----------------------------------------------------------
drop policy if exists "self read"             on public.bangchu;
drop policy if exists "admin_1 read all"      on public.bangchu;
drop policy if exists "self register pending" on public.bangchu;
drop policy if exists "admin_1 update all"    on public.bangchu;
drop policy if exists "admin_1 delete"        on public.bangchu;

-- Mỗi người đọc được dòng của chính mình (để login check trạng thái).
create policy "self read" on public.bangchu for select to authenticated
  using (auth_user_id = auth.uid());

-- admin_1 đọc toàn bộ (danh sách chờ duyệt trong Admin Panel).
create policy "admin_1 read all" on public.bangchu for select to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'));

-- Đăng ký: CHỈ cho tạo dòng của chính mình, luôn PENDING + INACTIVE,
-- role bị ép 'agent' (placeholder) — KHÔNG thể tự chọn role, KHÔNG có
-- trường mật khẩu trong bảng.
create policy "self register pending" on public.bangchu for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and status    = 'pending'
    and is_active = false
    and role      = 'agent'
  );

create policy "admin_1 update all" on public.bangchu for update to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'))
  with check (public.has_bangchu_role(auth.uid(), 'admin_1'));

create policy "admin_1 delete" on public.bangchu for delete to authenticated
  using (public.has_bangchu_role(auth.uid(), 'admin_1'));

-- 5) RPC duyệt / từ chối / khoá / mở khoá / đổi role / xoá -----------------
-- Chữ ký MỚI: approve_bangchu(uuid, bangchu_role) — admin_1 CHỌN ROLE lúc duyệt.
-- Drop bản 1-tham-số cũ để tránh overload gây ambiguous khi gọi RPC.
drop function if exists public.approve_bangchu(uuid);

create or replace function public.approve_bangchu(_target uuid, _role public.bangchu_role)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if not public.has_bangchu_role(_me, 'admin_1') then
    raise exception 'forbidden: only admin_1 may approve';
  end if;
  if _role is null then
    raise exception 'role is required';
  end if;
  update public.bangchu
     set status='approved', is_active=true, role=_role,
         approved_by=_me, approved_at=now()
   where id=_target;
  if not found then raise exception 'bangchu row not found'; end if;
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
  if not found then raise exception 'bangchu row not found'; end if;
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

grant execute on function public.approve_bangchu(uuid, public.bangchu_role) to authenticated;
grant execute on function public.reject_bangchu(uuid)         to authenticated;
grant execute on function public.lock_bangchu(uuid)           to authenticated;
grant execute on function public.unlock_bangchu(uuid)         to authenticated;
grant execute on function public.change_bangchu_role(uuid, public.bangchu_role) to authenticated;
grant execute on function public.delete_bangchu(uuid)         to authenticated;
grant execute on function public.has_bangchu_role(uuid, public.bangchu_role)    to authenticated;
grant execute on function public.is_active_bangchu(uuid)      to authenticated;

-- =====================================================================
-- 6) BOOTSTRAP BANG CHỦ ĐẦU TIÊN (chỉ làm 1 lần nếu chưa có admin_1)
--    a) Vào /<admin-slug>/register trên website, đăng ký username + mật khẩu
--       (tài khoản sẽ ở trạng thái PENDING, role placeholder 'agent')
--    b) Quay lại SQL Editor, thay 'BangChu_01' bằng username vừa đăng ký:
--
-- update public.bangchu
--    set role='admin_1', status='approved', is_active=true, approved_at=now()
--  where username='BangChu_01';
--
--    c) Đăng nhập tại /<admin-slug>/login → vào Admin Panel → mục
--       "Duyệt Admin" để duyệt + chọn role cho các tài khoản tiếp theo.
-- =====================================================================
