-- =====================================================================
-- HAI GIAI ĐOẠN: TẶNG QUÀ VIP — chỉ trừ khi tặng, cộng khi NHẬN ở thông báo
-- DB: zbuwddjcqdlyijcunwgd (Supabase SQL Editor)
--
-- GIAI ĐOẠN 1 — RPC `gift_gem_to_post`:
--   • Trừ ngay gem_balance người gửi.
--   • TUYỆT ĐỐI KHÔNG cộng gem_balance người nhận.
--   • Ghi post_gifts (để post-card hiển thị SUM, F5 không mất).
--   • Tạo notification cho người nhận với data:
--       status='pending', auto_settled=false, amount=<số gem>.
--   • Ghi gem_transactions(status='pending') để truy vết.
--
-- GIAI ĐOẠN 2 — RPC `claim_gift_notification(p_notification_id uuid)`:
--   • Chạy SECURITY DEFINER.
--   • Kiểm tra thông báo thuộc auth.uid() và còn 'pending'.
--   • Bật flag app.allow_gem_change='1' để bypass trigger, UPDATE
--     profiles.gem_balance += amount.
--   • Cập nhật notification: is_read=true, data.status='completed',
--     data.auto_settled=true, data.claimed_at=now().
--   • Trả jsonb: {ok, amount, new_balance}.
-- =====================================================================

------------------------------------------------------------------------
-- 1) Tái tạo gift_gem_to_post — KHÔNG cộng gem cho người nhận
------------------------------------------------------------------------
create or replace function public.gift_gem_to_post(
  p_post_id uuid,
  p_amount  bigint,
  p_note    text default null
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

  perform set_config('app.allow_gem_change',  '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  -- Khoá & trừ gem người gửi
  select coalesce(gem_balance, 0) into v_bal
    from public.profiles where id = v_from for update;
  if v_bal < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  end if;

  update public.profiles set gem_balance = v_bal - p_amount where id = v_from;

  -- KHÔNG cộng gem_balance người nhận ở đây. Tiền chỉ về ví khi người nhận
  -- bấm nút "Nhận" ở thông báo (claim_gift_notification).

  -- Ghi gem_transactions ở trạng thái pending
  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    values (v_from, v_to, p_amount, p_note, 'gift_post', p_post_id, 'pending', now())
    returning id into v_tx;
  exception when undefined_table or undefined_column then
    v_tx := null;
  end;

  -- Ghi post_gifts (post-card đọc SUM từ bảng này → F5 vẫn còn)
  insert into public.post_gifts(post_id, from_user_id, amount)
  values (p_post_id, v_from, p_amount)
  returning id into v_gift_id;

  -- Notification PENDING cho chủ bài viết
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
    'total_gem',      v_total,
    'status',         'pending'
  );
end;
$$;

revoke all on function public.gift_gem_to_post(uuid, bigint, text) from public;
grant execute on function public.gift_gem_to_post(uuid, bigint, text) to authenticated;


------------------------------------------------------------------------
-- 2) Tạo claim_gift_notification — cộng Gem khi người nhận bấm "Nhận"
------------------------------------------------------------------------
create or replace function public.claim_gift_notification(
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

  -- Khoá hàng notification để chống double-claim
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
  if v_status = 'completed' or (v_notif.data->>'auto_settled')::boolean is true then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'message', 'Đã nhận trước đó');
  end if;

  v_amount := coalesce((v_notif.data->>'amount')::bigint, 0);
  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  end if;

  -- Bypass trigger guard và cộng Gem vào ví người nhận
  perform set_config('app.allow_gem_change',  '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  update public.profiles
     set gem_balance = coalesce(gem_balance, 0) + v_amount
   where id = v_me
   returning gem_balance into v_new_bal;

  -- Cập nhật notification → completed
  update public.notifications
     set is_read = true,
         data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
           'status',       'completed',
           'auto_settled', true,
           'claimed_at',   to_jsonb(now())
         )
   where id = p_notification_id;

  -- Cập nhật gem_transactions tương ứng (nếu có)
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

revoke all on function public.claim_gift_notification(uuid) from public;
grant execute on function public.claim_gift_notification(uuid) to authenticated;
