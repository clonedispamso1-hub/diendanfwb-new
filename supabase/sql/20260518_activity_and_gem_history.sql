-- =========================================================
-- Activity Logs + Gem Transactions + Cooldown
-- Chạy trên DB cũ: zbuwddjcqdlyijcunwgd (SQL Editor Supabase)
-- =========================================================

-- 1) Bảng nhật ký hoạt động
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,          -- 'post_create','post_delete','follow','unfollow','donate','gem_send','gem_receive',...
  target_id uuid,                     -- id bài viết / user liên quan
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_time_idx
  on public.activity_logs(user_id, created_at desc);

alter table public.activity_logs enable row level security;

drop policy if exists "own activity read" on public.activity_logs;
create policy "own activity read"
  on public.activity_logs for select
  using (auth.uid() = user_id);

drop policy if exists "own activity insert" on public.activity_logs;
create policy "own activity insert"
  on public.activity_logs for insert
  with check (auth.uid() = user_id);

-- 2) Bảng giao dịch Gem (đầy đủ cho lịch sử số dư)
create table if not exists public.gem_transactions (
  id uuid primary key default gen_random_uuid(),
  from_id uuid references auth.users(id) on delete set null,
  to_id   uuid references auth.users(id) on delete set null,
  amount  bigint not null check (amount > 0),
  note    text,
  action_type text not null default 'transfer',  -- 'transfer','tip_post','donate','reward','refund'
  post_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gem_tx_from_idx on public.gem_transactions(from_id, created_at desc);
create index if not exists gem_tx_to_idx   on public.gem_transactions(to_id,   created_at desc);

alter table public.gem_transactions enable row level security;

drop policy if exists "see my gem tx" on public.gem_transactions;
create policy "see my gem tx"
  on public.gem_transactions for select
  using (auth.uid() = from_id or auth.uid() = to_id);

-- INSERT chỉ qua RPC (bên dưới) – không mở policy insert cho client.

-- 3) Cooldown 30s khi chuyển Gem
create table if not exists public.gem_transfer_cooldown (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_transfer_at timestamptz not null default now()
);
alter table public.gem_transfer_cooldown enable row level security;
drop policy if exists "own cooldown read" on public.gem_transfer_cooldown;
create policy "own cooldown read"
  on public.gem_transfer_cooldown for select
  using (auth.uid() = user_id);

-- 4) RPC chuyển Gem an toàn (atomic + cooldown + validation)
create or replace function public.transfer_gem_secure(
  p_to uuid,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_last timestamptz;
  v_balance bigint;
  v_tx_id uuid;
begin
  if v_from is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_to is null or p_to = v_from then
    raise exception 'INVALID_RECIPIENT';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Cooldown 30s
  select last_transfer_at into v_last
    from public.gem_transfer_cooldown where user_id = v_from;
  if v_last is not null and now() - v_last < interval '30 seconds' then
    raise exception 'COOLDOWN: %', extract(epoch from (interval '30 seconds' - (now() - v_last)))::int;
  end if;

  -- Lock + check số dư (giả định cột `candy` trên profiles – đổi nếu DB cũ dùng tên khác)
  select candy into v_balance from public.profiles where id = v_from for update;
  if v_balance is null or v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.profiles set candy = candy - p_amount where id = v_from;
  update public.profiles set candy = coalesce(candy,0) + p_amount where id = p_to;

  insert into public.gem_transactions(from_id, to_id, amount, note, action_type)
    values (v_from, p_to, p_amount, p_note, 'transfer')
    returning id into v_tx_id;

  insert into public.activity_logs(user_id, action_type, target_id, metadata)
    values
      (v_from, 'gem_send',    p_to,   jsonb_build_object('amount', p_amount, 'note', p_note, 'tx', v_tx_id)),
      (p_to,   'gem_receive', v_from, jsonb_build_object('amount', p_amount, 'note', p_note, 'tx', v_tx_id));

  insert into public.gem_transfer_cooldown(user_id, last_transfer_at)
    values (v_from, now())
    on conflict (user_id) do update set last_transfer_at = excluded.last_transfer_at;

  return jsonb_build_object('ok', true, 'tx_id', v_tx_id);
end;
$$;

grant execute on function public.transfer_gem_secure(uuid, bigint, text) to authenticated;

-- 5) Realtime cho popup nhận Gem
alter publication supabase_realtime add table public.gem_transactions;
alter publication supabase_realtime add table public.activity_logs;
