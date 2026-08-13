-- ============================================================
-- V7 — Rút tiền: hoàn tiền qua ngày + giữ lịch sử tối thiểu 7 ngày
-- Chạy trực tiếp trong Supabase SQL Editor. Idempotent.
-- Không phụ thuộc extension hay bộ lập lịch của database.
-- ============================================================

-- 1) Cho phép trạng thái 'refunded' (đã hoàn tiền)
alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_status_check;
alter table public.withdrawal_requests
  add constraint withdrawal_requests_status_check
  check (status in ('pending','approved','rejected','refunded'));

-- ============================================================
-- 2) Hoàn xu cho đơn còn "Chờ duyệt" từ trước 00:00 hôm nay
--    Mốc ngày được tính theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
-- ============================================================
create or replace function public.expire_pending_withdrawals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
  v_today_start timestamptz := date_trunc(
    'day',
    now() at time zone 'Asia/Ho_Chi_Minh'
  ) at time zone 'Asia/Ho_Chi_Minh';
begin
  for r in
    select * from public.withdrawal_requests
    where status = 'pending'
      and created_at < v_today_start
    for update
  loop
    update public.profiles
       set gem_balance = coalesce(gem_balance, 0) + r.amount
     where id = r.user_id;

    if not found then
      raise exception 'Không tìm thấy ví để hoàn xu cho yêu cầu %', r.id;
    end if;

    update public.withdrawal_requests
       set status = 'refunded',
           admin_note = coalesce(admin_note, 'Hết hạn — hệ thống tự hoàn xu'),
           processed_at = now()
     where id = r.id;

    begin
      insert into public.notifications(user_id, type, kind, entity_type, entity_id,
                                       title, message, data, is_read)
      values (
        r.user_id, 'withdraw_refunded', 'withdraw_refunded', 'withdrawal', r.id::text,
        'Yêu cầu rút tiền đã hết hạn',
        'Yêu cầu rút tiền #' || r.code || ' đã hết hạn. Hệ thống đã hoàn lại '
          || to_char(r.amount, 'FM999,999,999,999') || ' xu.',
        jsonb_build_object('withdrawal_id', r.id, 'code', r.code, 'amount', r.amount),
        false
      );
    exception when others then
      null; -- thông báo lỗi không được chặn việc hoàn tiền
    end;

    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.expire_pending_withdrawals() to service_role;

-- ============================================================
-- 3) Dọn các đơn đã xử lý sau ít nhất 7 ngày
-- ============================================================
create or replace function public.cleanup_withdrawal_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.withdrawal_requests
   where status <> 'pending'
     and coalesce(processed_at, created_at) < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.cleanup_withdrawal_history() to service_role;

-- Dọn lịch sử chuyển xu + thông báo chuyển xu sau ít nhất 7 ngày
create or replace function public.cleanup_transfer_history()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    delete from public.gem_transactions where created_at < now() - interval '7 days';
  exception when undefined_table then null; end;

  begin
    delete from public.transfer_transactions
     where status <> 'pending' and created_at < now() - interval '7 days';
  exception when undefined_table then null; end;

  begin
    delete from public.notifications
     where created_at < now() - interval '7 days'
       and type in ('transfer_pending','transfer_claimed','gem_received','wallet_transfer');
  exception when undefined_table then null; end;
end;
$$;

grant execute on function public.cleanup_transfer_history() to service_role;

-- ============================================================
-- 4) RPC bảo trì: website gọi khi có lượt truy cập.
--    Advisory lock + dấu ngày đảm bảo tối đa một lần/ngày Việt Nam.
-- ============================================================
create or replace function public.run_daily_wallet_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_last_run date;
  v_expired integer := 0;
  v_withdrawals_deleted integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('daily_wallet_maintenance_v7'));

  select case
           when value->>'last_run_date' ~ '^\d{4}-\d{2}-\d{2}$'
             then (value->>'last_run_date')::date
           else null
         end
    into v_last_run
    from public.admin_site_settings
   where key = 'wallet_daily_maintenance';

  if v_last_run = v_today then
    return jsonb_build_object('ran', false, 'date', v_today);
  end if;

  v_expired := public.expire_pending_withdrawals();
  v_withdrawals_deleted := public.cleanup_withdrawal_history();
  perform public.cleanup_transfer_history();

  insert into public.admin_site_settings(key, value)
  values (
    'wallet_daily_maintenance',
    jsonb_build_object('last_run_date', v_today, 'ran_at', now())
  )
  on conflict (key) do update
    set value = excluded.value;

  return jsonb_build_object(
    'ran', true,
    'date', v_today,
    'withdrawals_refunded', v_expired,
    'withdrawals_deleted', v_withdrawals_deleted
  );
end;
$$;

grant execute on function public.run_daily_wallet_maintenance() to anon, authenticated, service_role;

-- ============================================================
-- 5) RPC: lịch sử rút tiền của chính mình
-- ============================================================
create or replace function public.my_withdrawal_requests()
returns setof public.withdrawal_requests
language sql
stable
security definer
set search_path = public
as $$
  select * from public.withdrawal_requests
  where user_id = auth.uid()
  order by created_at desc
  limit 200;
$$;

grant execute on function public.my_withdrawal_requests() to authenticated;
