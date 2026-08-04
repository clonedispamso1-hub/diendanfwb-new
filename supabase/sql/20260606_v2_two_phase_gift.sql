-- =====================================================================
-- TWO-PHASE GIFT FLOW (V2) — chạy trong Supabase SQL Editor
-- DB: zbuwddjcqdlyijcunwgd
--
-- PHA 1: gift_gem_to_post_v2(p_post_id, p_amount)
--   • Bất kỳ user đăng nhập (auth.uid()) đều gọi được.
--   • Bật set_config('app.allow_gem_change','1', true) → bypass trigger guard.
--   • TRỪ gem_balance NGƯỜI GỬI.
--   • TUYỆT ĐỐI không cộng gem_balance người nhận.
--   • Ghi post_gifts (để SUM hiển thị dưới bài viết, F5 không mất).
--   • Tạo notification cho người nhận với
--       data = {amount, status:'pending', auto_settled:false, ...}
--
-- PHA 2: claim_gift_gem_notification(p_notification_id)
--   • Người nhận bấm "Nhận" → RPC này check ownership + status='pending'.
--   • Bật flag → CỘNG gem_balance vào ví người nhận.
--   • Đánh dấu notification is_read=true, data.status='completed'.
-- =====================================================================

------------------------------------------------------------------------
-- PHA 1
------------------------------------------------------------------------
create or replace function public.gift_gem_to_post_v2(
  p_post_id uuid,
  p_amount  bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from    uuid := auth.uid();
  v_to      uuid;
  v_bal     bigint;
  v_new_bal bigint;
  v_tx      uuid;
  v_gift_id uuid;
  v_notif   uuid;
  v_total   bigint;
begin
  if v_from is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  end if;

  select user_id into v_to from public.posts where id = p_post_id;
  if v_to is null then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Bài viết không tồn tại');
  end if;
  if v_to = v_from then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng quà cho mình');
  end if;

  -- Bypass trigger guard (transaction-local)
  perform set_config('app.allow_gem_change',  '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  -- Khoá & trừ Gem người gửi
  select coalesce(gem_balance, 0) into v_bal
    from public.profiles where id = v_from for update;
  if v_bal < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  end if;

  update public.profiles
     set gem_balance = v_bal - p_amount
   where id = v_from
   returning gem_balance into v_new_bal;
  -- KHÔNG cộng cho người nhận tại đây.

  -- Ghi gem_transactions trạng thái pending
  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    values (v_from, v_to, p_amount, 'Tặng Gem cho bài viết', 'gift_post', p_post_id, 'pending', now())
    returning id into v_tx;
  exception when undefined_table or undefined_column then
    v_tx := null;
  end;

  -- Ghi post_gifts (SUM hiển thị dưới bài)
  insert into public.post_gifts(post_id, from_user_id, amount)
  values (p_post_id, v_from, p_amount)
  returning id into v_gift_id;

  -- Notification PENDING
  begin
    insert into public.notifications(user_id, type, title, message, data, is_read, created_at)
    values (
      v_to,
      'gift_post',
      '🎁 Có người tặng Gem cho bài viết của bạn',
      'Bấm Nhận để cộng ' || p_amount::text || ' Gem vào ví của bạn.',
      jsonb_build_object(
        'amount',         p_amount,
        'post_id',        p_post_id,
        'from_user_id',   v_from,
        'transaction_id', v_tx,
        'gift_id',        v_gift_id,
        'status',         'pending',
        'auto_settled',   false
      ),
      false,
      now()
    )
    returning id into v_notif;
  exception when undefined_table or undefined_column then
    v_notif := null;
  end;

  select coalesce(sum(amount), 0) into v_total
    from public.post_gifts where post_id = p_post_id;

  return jsonb_build_object(
    'ok',             true,
    'transaction_id', v_tx,
    'gift_id',        v_gift_id,
    'notif_id',       v_notif,
    'amount',         p_amount,
    'new_balance',    v_new_bal,
    'sender_new_balance', v_new_bal,
    'total_gem',      v_total,
    'status',         'pending'
  );
end;
$$;

revoke all on function public.gift_gem_to_post_v2(uuid, bigint) from public;
grant execute on function public.gift_gem_to_post_v2(uuid, bigint) to authenticated;


------------------------------------------------------------------------
-- PHA 2
------------------------------------------------------------------------
create or replace function public.claim_gift_gem_notification(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_notif   public.notifications%rowtype;
  v_amount  bigint;
  v_status  text;
  v_tx_id   uuid;
  v_new_bal bigint;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  end if;

  select * into v_notif
    from public.notifications
   where id = p_notification_id
   for update;

  if v_notif.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Thông báo không tồn tại');
  end if;
  if v_notif.user_id <> v_me then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền nhận thông báo này');
  end if;

  v_status := coalesce(v_notif.data->>'status', 'pending');
  if v_status = 'completed' or coalesce((v_notif.data->>'auto_settled')::boolean, false) is true then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'message', 'Đã nhận trước đó');
  end if;

  v_amount := coalesce((v_notif.data->>'amount')::bigint, 0);
  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  end if;

  -- Bypass trigger guard và cộng Gem
  perform set_config('app.allow_gem_change',  '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  update public.profiles
     set gem_balance = coalesce(gem_balance, 0) + v_amount
   where id = v_me
   returning gem_balance into v_new_bal;

  update public.notifications
     set is_read = true,
         data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
           'status',       'completed',
           'auto_settled', true,
           'claimed_at',   to_jsonb(now())
         )
   where id = p_notification_id;

  v_tx_id := nullif(v_notif.data->>'transaction_id', '')::uuid;
  if v_tx_id is not null then
    begin
      update public.gem_transactions
         set status = 'completed'
       where id = v_tx_id;
    exception when undefined_table or undefined_column then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok',          true,
    'amount',      v_amount,
    'new_balance', v_new_bal
  );
end;
$$;

revoke all on function public.claim_gift_gem_notification(uuid) from public;
grant execute on function public.claim_gift_gem_notification(uuid) to authenticated;

-- BACKWARD COMPAT: giữ tên cũ claim_gift_notification để frontend hiện tại
-- vẫn chạy được nếu chưa kịp deploy bản mới.
create or replace function public.claim_gift_notification(
  p_notification_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.claim_gift_gem_notification(p_notification_id);
$$;

revoke all on function public.claim_gift_notification(uuid) from public;
grant execute on function public.claim_gift_notification(uuid) to authenticated;
