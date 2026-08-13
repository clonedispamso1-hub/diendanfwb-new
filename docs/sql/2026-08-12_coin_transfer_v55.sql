-- ============================================================
-- ADMIN PANEL V5.5 — HỆ THỐNG CHUYỂN XU (UID) + NHẬN XU
--
-- Bao gồm:
--   • bảng public.transfer_transactions   (giao dịch chuyển xu)
--   • bảng public.transfer_audit_log      (audit log)
--   • RPC public.lookup_member_by_uid()   (tra cứu người nhận theo Mã TV)
--   • RPC public.transfer_balance()       (atomic, FOR UPDATE)
--   • RPC public.claim_transfer()         (atomic, người nhận bấm "Nhận")
--   • RLS đầy đủ + GRANT + realtime
--
-- Idempotent. KHÔNG đổi Supabase URL / API key / project.
-- Chạy trong SQL editor của project hiện tại.
-- ============================================================

-- ---------- 0) Cấu hình phí (admin có thể sửa) ----------
insert into public.admin_site_settings(key, value)
values ('coin_transfer_config', jsonb_build_object('fee_percent', 0, 'min_amount', 1000))
on conflict (key) do nothing;

-- ---------- 1) Bảng giao dịch ----------
create table if not exists public.transfer_transactions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  sender_public_id text,
  receiver_public_id text,
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  net_amount bigint not null check (net_amount >= 0),
  note text,
  status text not null default 'pending' check (status in ('pending','claimed','cancelled')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists idx_tt_sender   on public.transfer_transactions(sender_id, created_at desc);
create index if not exists idx_tt_receiver on public.transfer_transactions(receiver_id, created_at desc);
create index if not exists idx_tt_status   on public.transfer_transactions(status, created_at desc);

grant select on public.transfer_transactions to authenticated;
grant all    on public.transfer_transactions to service_role;

alter table public.transfer_transactions enable row level security;

drop policy if exists "tt_select_own" on public.transfer_transactions;
create policy "tt_select_own" on public.transfer_transactions
for select to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid() or public.is_admin(auth.uid()));

-- ---------- 2) Audit log ----------
create table if not exists public.transfer_audit_log (
  id bigserial primary key,
  transfer_id uuid references public.transfer_transactions(id) on delete cascade,
  actor_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tal_transfer on public.transfer_audit_log(transfer_id, created_at desc);

grant select on public.transfer_audit_log to authenticated;
grant all    on public.transfer_audit_log to service_role;

alter table public.transfer_audit_log enable row level security;

drop policy if exists "tal_select_admin" on public.transfer_audit_log;
create policy "tal_select_admin" on public.transfer_audit_log
for select to authenticated
using (public.is_admin(auth.uid()));

-- ---------- 3) Tra cứu thành viên theo Mã thành viên (UID) ----------
create or replace function public.lookup_member_by_uid(p_uid text)
returns table (id uuid, full_name text, avatar text, public_id text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar, p.public_id::text
  from public.profiles p
  where p.public_id is not null
    and upper(p.public_id::text) = upper(trim(p_uid))
    and coalesce(p.is_banned, false) = false
  limit 1;
$$;

grant execute on function public.lookup_member_by_uid(text) to authenticated;

-- ---------- 4) RPC chuyển xu (atomic) ----------
create or replace function public.transfer_balance(
  p_receiver_uid text,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender    uuid := auth.uid();
  v_receiver  uuid;
  v_cfg       jsonb;
  v_fee_pct   numeric;
  v_min       bigint;
  v_fee       bigint;
  v_net       bigint;
  v_balance   bigint;
  v_sender_pid text;
  v_recv_pid  text;
  v_sender_name text;
  v_tx        uuid;
begin
  if v_sender is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT', 'message', 'Số xu không hợp lệ.');
  end if;

  select value into v_cfg from public.admin_site_settings where key = 'coin_transfer_config';
  v_fee_pct := coalesce((v_cfg->>'fee_percent')::numeric, 0);
  v_min     := coalesce((v_cfg->>'min_amount')::bigint, 1);

  if p_amount < v_min then
    return jsonb_build_object('ok', false, 'code', 'MIN_AMOUNT',
      'message', 'Số xu tối thiểu là ' || v_min::text || '.');
  end if;

  select p.id, p.public_id::text into v_receiver, v_recv_pid
  from public.profiles p
  where p.public_id is not null
    and upper(p.public_id::text) = upper(trim(p_receiver_uid))
    and coalesce(p.is_banned, false) = false
  limit 1;

  if v_receiver is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy thành viên.');
  end if;
  if v_receiver = v_sender then
    return jsonb_build_object('ok', false, 'code', 'SELF', 'message', 'Không thể tự chuyển xu cho chính mình.');
  end if;

  v_fee := floor(p_amount * v_fee_pct / 100.0)::bigint;
  v_net := p_amount - v_fee;

  -- Khoá hàng người gửi để tránh race condition.
  select coalesce(gem_balance, 0), public_id::text, full_name
    into v_balance, v_sender_pid, v_sender_name
  from public.profiles
  where id = v_sender
  for update;

  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT', 'message', 'Số dư không đủ.');
  end if;

  update public.profiles
     set gem_balance = coalesce(gem_balance, 0) - p_amount
   where id = v_sender;

  insert into public.transfer_transactions(
    sender_id, receiver_id, sender_public_id, receiver_public_id,
    amount, fee, net_amount, note, status
  ) values (
    v_sender, v_receiver, v_sender_pid, v_recv_pid,
    p_amount, v_fee, v_net, nullif(trim(coalesce(p_note, '')), ''), 'pending'
  ) returning id into v_tx;

  insert into public.transfer_audit_log(transfer_id, actor_id, action, detail)
  values (v_tx, v_sender, 'transfer_created',
          jsonb_build_object('amount', p_amount, 'fee', v_fee, 'net', v_net, 'receiver', v_receiver));

  -- Thông báo cho người nhận (phải bấm "Nhận" mới cộng tiền).
  insert into public.notifications(user_id, type, kind, entity_type, entity_id,
                                   last_actor_id, title, message, data, is_read)
  values (
    v_receiver, 'transfer_pending', 'transfer_pending', 'transfer', v_tx::text,
    v_sender,
    'Bạn nhận được xu',
    coalesce(v_sender_name, 'Ai đó') || ' đã chuyển ' || v_net::text || ' xu',
    jsonb_build_object(
      'transfer_id', v_tx,
      'amount', v_net,
      'gross_amount', p_amount,
      'fee', v_fee,
      'sender_id', v_sender,
      'sender_public_id', v_sender_pid,
      'claimed', false,
      'status', 'pending'
    ),
    false
  );

  return jsonb_build_object(
    'ok', true, 'transfer_id', v_tx, 'amount', p_amount,
    'fee', v_fee, 'net_amount', v_net,
    'new_balance', v_balance - p_amount
  );
end;
$$;

grant execute on function public.transfer_balance(text, bigint, text) to authenticated;

-- ---------- 5) RPC nhận xu (atomic) ----------
create or replace function public.claim_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx  public.transfer_transactions;
  v_new bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  end if;

  select * into v_tx
  from public.transfer_transactions
  where id = p_transfer_id
  for update;

  if v_tx.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Giao dịch không tồn tại.');
  end if;
  if v_tx.receiver_id <> v_uid then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không phải người nhận.');
  end if;
  if v_tx.status = 'claimed' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'message', 'Giao dịch đã được nhận.');
  end if;
  if v_tx.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Giao dịch không hợp lệ.');
  end if;

  update public.profiles
     set gem_balance = coalesce(gem_balance, 0) + v_tx.net_amount
   where id = v_uid
  returning gem_balance into v_new;

  update public.transfer_transactions
     set status = 'claimed', claimed_at = now()
   where id = v_tx.id;

  insert into public.transfer_audit_log(transfer_id, actor_id, action, detail)
  values (v_tx.id, v_uid, 'transfer_claimed', jsonb_build_object('net', v_tx.net_amount));

  update public.notifications
     set is_read = true,
         data = coalesce(data, '{}'::jsonb) || jsonb_build_object('claimed', true, 'status', 'claimed')
   where user_id = v_uid
     and entity_type = 'transfer'
     and entity_id = v_tx.id::text;

  return jsonb_build_object('ok', true, 'amount', v_tx.net_amount, 'new_balance', v_new);
end;
$$;

grant execute on function public.claim_transfer(uuid) to authenticated;

-- ---------- 6) Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.transfer_transactions;
  exception when duplicate_object then null;
  end;
end $$;
