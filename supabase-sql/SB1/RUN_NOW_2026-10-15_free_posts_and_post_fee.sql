-- =====================================================================
-- CHẠY TRÊN SUPABASE 1 (core: profiles + gem_balance).
-- 3 lượt đăng bài miễn phí cho tài khoản MỚI + phí 5.000 gem/bài khi hết lượt.
-- CHẠY FILE NÀY TRƯỚC, sau đó chạy ngay file SB3/RUN_NOW_2026-10-15_post_ticket_guard.sql.
-- An toàn chạy lại nhiều lần. KHÔNG xoá/sửa dữ liệu cũ, KHÔNG đụng bài đăng.
-- Tài khoản đã tồn tại trước khi chạy file này KHÔNG được cấp 3 lượt.
-- =====================================================================

-- 1) Số lượt miễn phí còn lại theo từng tài khoản ----------------------
create table if not exists public.post_quota (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  free_remaining integer not null default 0 check (free_remaining >= 0),
  free_granted boolean not null default false,
  paid_posts integer not null default 0,
  updated_at timestamptz not null default now()
);
grant select on public.post_quota to authenticated;
grant all on public.post_quota to service_role;
alter table public.post_quota enable row level security;
drop policy if exists "post_quota_read_own" on public.post_quota;
create policy "post_quota_read_own" on public.post_quota
  for select to authenticated using (user_id = auth.uid());
-- Không có policy ghi: chỉ các hàm SECURITY DEFINER bên dưới được sửa.

-- 2) Nhật ký vé đăng bài (miễn phí / trả phí) -------------------------
create table if not exists public.post_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('free','paid')),
  amount bigint not null default 0,
  status text not null default 'reserved' check (status in ('reserved','used')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists post_charges_open_idx
  on public.post_charges(user_id, created_at desc) where status = 'reserved';
grant select on public.post_charges to authenticated;
grant all on public.post_charges to service_role;
alter table public.post_charges enable row level security;
drop policy if exists "post_charges_read_own" on public.post_charges;
create policy "post_charges_read_own" on public.post_charges
  for select to authenticated using (user_id = auth.uid());

-- 3) Khoá ký vé (không ai ngoài các hàm bên dưới đọc được) -------------
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.post_ticket_secret (
  id boolean primary key default true check (id),
  secret text not null
);
insert into private.post_ticket_secret(id, secret)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create or replace function private.sign_post_ticket(p_charge uuid, p_user uuid, p_kind text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_msg text;
begin
  select secret into v_secret from private.post_ticket_secret where id;
  v_msg := p_charge::text || '.' || p_user::text || '.' || p_kind || '.'
           || floor(extract(epoch from now() + interval '24 hours'))::bigint::text;
  return v_msg || '.' || encode(extensions.hmac(v_msg, v_secret, 'sha256'), 'hex');
end; $$;
revoke all on function private.sign_post_ticket(uuid, uuid, text) from public, anon, authenticated;

-- 4) Tài khoản mới → tự cấp 3 lượt (một lần duy nhất) -----------------
create or replace function public.grant_new_user_free_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.post_quota(user_id, free_remaining, free_granted)
  values (NEW.id, 3, true)
  on conflict (user_id) do nothing;
  return NEW;
exception when others then
  raise warning 'grant_new_user_free_posts failed for %: %', NEW.id, sqlerrm;
  return NEW;
end; $$;

drop trigger if exists trg_grant_new_user_free_posts on public.profiles;
create trigger trg_grant_new_user_free_posts
  after insert on public.profiles
  for each row execute function public.grant_new_user_free_posts();

-- Tài khoản ĐÃ CÓ trước khi chạy file: ghi sẵn 0 lượt để không bao giờ nhận 3 lượt.
insert into public.post_quota(user_id, free_remaining, free_granted)
select id, 0, false from public.profiles
on conflict (user_id) do nothing;

-- 5) Lấy vé đăng 1 bài. Giá cố định ở server: 5.000 --------------------
drop function if exists public.refund_post_slot(uuid);

create or replace function public.reserve_post_slot(p_confirm_paid boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prof record;
  v_open record;
  v_free integer;
  v_id uuid;
  c_price constant bigint := 5000;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', 'Chưa đăng nhập');
  end if;

  -- Khoá dòng profile → các yêu cầu đồng thời của cùng user xếp hàng.
  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', 'Không tìm thấy tài khoản');
  end if;

  -- Admin: vé miễn trừ, không trừ lượt/tiền (dùng cho cả bài của clone).
  if coalesce((to_jsonb(v_prof)->>'is_admin')::boolean, false) then
    return jsonb_build_object('ok', true, 'kind', 'exempt', 'charge_id', null,
      'ticket', private.sign_post_ticket(gen_random_uuid(), v_uid, 'exempt'));
  end if;

  -- Vé đã trả (miễn phí/tiền) nhưng bài chưa tạo được → dùng lại, KHÔNG trừ lần nữa.
  select id, kind into v_open from public.post_charges
   where user_id = v_uid and status = 'reserved' and created_at > now() - interval '23 hours'
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'kind', v_open.kind, 'charge_id', v_open.id, 'reused', true,
      'ticket', private.sign_post_ticket(v_open.id, v_uid, v_open.kind));
  end if;

  insert into public.post_quota(user_id, free_remaining, free_granted)
  values (v_uid, 0, false) on conflict (user_id) do nothing;
  select free_remaining into v_free from public.post_quota where user_id = v_uid for update;

  if v_free > 0 then
    update public.post_quota set free_remaining = free_remaining - 1, updated_at = now()
     where user_id = v_uid;
    insert into public.post_charges(user_id, kind, amount) values (v_uid, 'free', 0)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'kind', 'free', 'charge_id', v_id,
      'free_remaining', v_free - 1, 'ticket', private.sign_post_ticket(v_id, v_uid, 'free'));
  end if;

  if not coalesce(p_confirm_paid, false) then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED', 'price', c_price,
                              'balance', coalesce(v_prof.gem_balance, 0));
  end if;

  if coalesce(v_prof.gem_balance, 0) < c_price then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT', 'price', c_price,
                              'balance', coalesce(v_prof.gem_balance, 0),
                              'message', 'Số dư ví không đủ');
  end if;

  update public.profiles set gem_balance = gem_balance - c_price where id = v_uid;
  update public.post_quota set paid_posts = paid_posts + 1, updated_at = now() where user_id = v_uid;
  insert into public.post_charges(user_id, kind, amount) values (v_uid, 'paid', c_price)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'kind', 'paid', 'charge_id', v_id, 'price', c_price,
    'balance', coalesce(v_prof.gem_balance, 0) - c_price,
    'ticket', private.sign_post_ticket(v_id, v_uid, 'paid'));
end; $$;

-- 6) Đánh dấu vé đã dùng (bài đã tạo trên Supabase 3) -----------------
create or replace function public.mark_post_charge_used(p_charge_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.post_charges set status = 'used', used_at = now()
   where id = p_charge_id and user_id = auth.uid() and status = 'reserved';
$$;

revoke all on function public.reserve_post_slot(boolean) from public, anon;
revoke all on function public.mark_post_charge_used(uuid) from public, anon;
grant execute on function public.reserve_post_slot(boolean) to authenticated;
grant execute on function public.mark_post_charge_used(uuid) to authenticated;

-- 7) COPY chuỗi này dán vào file SB3 (chỗ DAN_KHOA_TU_SUPABASE_1) ------
select secret as copy_this_into_sb3 from private.post_ticket_secret;
