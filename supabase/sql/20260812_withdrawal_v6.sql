-- ============================================================
-- V6 — Ví xu + Rút tiền  (chạy thủ công trong Supabase SQL Editor)
-- Tạo bảng yêu cầu rút tiền + RPC tạo/duyệt/từ chối.
-- KHÔNG đụng tới hệ thống Gift / VIP / Admin hiện có.
-- ============================================================

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount > 0),
  fee bigint not null default 0,
  net_amount bigint not null default 0,
  bank_name text not null,
  bank_account text not null,
  account_holder text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert on public.withdrawal_requests to authenticated;
grant all on public.withdrawal_requests to service_role;

alter table public.withdrawal_requests enable row level security;

drop policy if exists "wd_select_own" on public.withdrawal_requests;
create policy "wd_select_own" on public.withdrawal_requests
  for select to authenticated
  using (auth.uid() = user_id);

create index if not exists withdrawal_requests_user_idx on public.withdrawal_requests(user_id, created_at desc);
create index if not exists withdrawal_requests_status_idx on public.withdrawal_requests(status, created_at desc);

-- Cấu hình rút tiền (phí %, mức tối thiểu) — lưu trong admin_site_settings
insert into public.admin_site_settings(key, value)
values ('withdraw_config', jsonb_build_object('fee_percent', 20, 'min_amount', 50000))
on conflict (key) do nothing;

-- ============================================================
-- RPC: tạo yêu cầu rút tiền (trừ xu ngay)
-- ============================================================
create or replace function public.create_withdrawal_request(
  p_amount bigint,
  p_bank_name text,
  p_bank_account text,
  p_account_holder text
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_fee_percent numeric := 20;
  v_min bigint := 50000;
  v_fee bigint;
  v_net bigint;
  v_code text;
  v_row public.withdrawal_requests;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập';
  end if;

  select coalesce((value->>'fee_percent')::numeric, 20),
         coalesce((value->>'min_amount')::bigint, 50000)
    into v_fee_percent, v_min
  from public.admin_site_settings where key = 'withdraw_config';

  v_fee_percent := coalesce(v_fee_percent, 20);
  v_min := coalesce(v_min, 50000);

  if p_amount is null or p_amount < v_min then
    raise exception 'Số xu rút tối thiểu là %', v_min;
  end if;
  if coalesce(btrim(p_bank_name), '') = ''
     or coalesce(btrim(p_bank_account), '') = ''
     or coalesce(btrim(p_account_holder), '') = '' then
    raise exception 'Vui lòng nhập đầy đủ thông tin ngân hàng';
  end if;

  select coalesce(gem_balance, 0) into v_balance
  from public.profiles where id = v_uid for update;

  if v_balance is null or v_balance < p_amount then
    raise exception 'Số dư không đủ';
  end if;

  v_fee := floor(p_amount * v_fee_percent / 100.0)::bigint;
  v_net := p_amount - v_fee;

  v_code := 'WD-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD') || '-' ||
            lpad(((floor(random() * 900000) + 100000))::text, 6, '0');

  update public.profiles
     set gem_balance = coalesce(gem_balance, 0) - p_amount
   where id = v_uid;

  insert into public.withdrawal_requests(
    code, user_id, amount, fee, net_amount, bank_name, bank_account, account_holder, status
  ) values (
    v_code, v_uid, p_amount, v_fee, v_net,
    btrim(p_bank_name), btrim(p_bank_account), btrim(p_account_holder), 'pending'
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_withdrawal_request(bigint, text, text, text) to authenticated;

-- ============================================================
-- RPC: admin duyệt / từ chối (từ chối thì hoàn xu)
-- ============================================================
create or replace function public.review_withdrawal_request(
  p_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.withdrawal_requests;
begin
  select * into v_row from public.withdrawal_requests where id = p_id for update;
  if v_row.id is null then
    raise exception 'Không tìm thấy yêu cầu';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Yêu cầu đã được xử lý';
  end if;

  if p_approve then
    update public.withdrawal_requests
       set status = 'approved', admin_note = p_note, processed_at = now()
     where id = p_id returning * into v_row;
  else
    update public.profiles
       set gem_balance = coalesce(gem_balance, 0) + v_row.amount
     where id = v_row.user_id;
    update public.withdrawal_requests
       set status = 'rejected', admin_note = p_note, processed_at = now()
     where id = p_id returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.review_withdrawal_request(uuid, boolean, text) to authenticated;
grant execute on function public.review_withdrawal_request(uuid, boolean, text) to service_role;

-- Admin xem toàn bộ yêu cầu (dùng cho Admin Panel qua RPC, tránh nới RLS)
create or replace function public.admin_list_withdrawal_requests(p_status text default null)
returns setof public.withdrawal_requests
language sql
security definer
set search_path = public
as $$
  select * from public.withdrawal_requests
  where p_status is null or status = p_status
  order by created_at desc
  limit 500;
$$;

grant execute on function public.admin_list_withdrawal_requests(text) to authenticated;
