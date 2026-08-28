-- RUN ON SUPABASE #1 ONLY
-- =============================================================================
-- 2026-08-24 — Hủy đơn rút tiền do CHÍNH CHỦ yêu cầu.
-- Sửa lỗi: "Could not find the function public.request_cancel_withdrawal(...)".
-- Idempotent. KHÔNG đổi logic tài chính: hoàn đúng số xu đã trừ, 1 lần duy nhất.
-- =============================================================================

begin;

alter table public.withdrawal_requests
  add column if not exists cancel_requested_at timestamptz;

-- -----------------------------------------------------------------------------
-- request_cancel_withdrawal(p_id) — chỉ đơn 'pending' của chính mình.
-- Đặt trạng thái 'cancel_requested'; xu được hoàn bởi finalize (sau 5 phút).
-- Có 2 tên tham số (p_id / p_request_id) để tương thích mọi phiên bản client.
-- -----------------------------------------------------------------------------
create or replace function public.request_cancel_withdrawal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_owner  uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED',
                              'message', 'Bạn cần đăng nhập.');
  end if;

  select w.user_id, w.status into v_owner, v_status
    from public.withdrawal_requests w
   where w.id = p_id
   for update;

  if v_owner is null or v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND',
                              'message', 'Không tìm thấy yêu cầu rút tiền của bạn.');
  end if;

  if v_status = 'cancel_requested' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_REQUESTED');
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'NOT_PENDING',
                              'message', 'Đơn đã được xử lý, không thể huỷ.');
  end if;

  update public.withdrawal_requests w
     set status              = 'cancel_requested',
         cancel_requested_at = now()
   where w.id = p_id;

  return jsonb_build_object('ok', true, 'code', 'CANCEL_REQUESTED');
end;
$$;

create or replace function public.request_cancel_withdrawal(p_request_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.request_cancel_withdrawal(p_request_id);
$$;

revoke all on function public.request_cancel_withdrawal(uuid) from public, anon;
revoke all on function public.request_cancel_withdrawal(uuid) from public, anon;
grant execute on function public.request_cancel_withdrawal(uuid) to authenticated;
grant execute on function public.request_cancel_withdrawal(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- finalize_cancelled_withdrawals() — hoàn xu cho đơn đã yêu cầu huỷ > 5 phút.
-- Gọi bởi cron/service_role. Hoàn đúng w.amount, đúng 1 lần (status đổi).
-- -----------------------------------------------------------------------------
create or replace function public.finalize_cancelled_withdrawals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select w.id, w.user_id, w.amount
      from public.withdrawal_requests w
     where w.status = 'cancel_requested'
       and coalesce(w.cancel_requested_at, w.created_at) < now() - interval '5 minutes'
     for update
  loop
    update public.profiles p
       set gem_balance = coalesce(p.gem_balance, 0) + r.amount
     where p.id = r.user_id;

    update public.withdrawal_requests w
       set status       = 'cancelled',
           admin_note   = coalesce(w.admin_note, 'Thành viên tự huỷ — đã hoàn xu'),
           processed_at = now()
     where w.id = r.id;

    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.finalize_cancelled_withdrawals() from public, anon, authenticated;
grant execute on function public.finalize_cancelled_withdrawals() to service_role;

commit;
