-- =====================================================================
-- ATOMIC FIX: VIP Gift flow — transfer Gem + log post_gifts + notify
-- DB: zbuwddjcqdlyijcunwgd (Supabase SQL Editor)
--
-- Trước đó nút "Tặng quà VIP" chỉ gọi `secure_transfer_gem` → chỉ trừ &
-- cộng gem_balance, KHÔNG ghi `post_gifts`, KHÔNG tạo notification.
-- Sau F5, dòng "Bài viết này nhận được X Gem" biến mất (vì post-card
-- đọc SUM(post_gifts.amount)) và người nhận không thấy thông báo.
--
-- File này tạo RPC `gift_gem_to_post(p_post_id, p_amount, p_note)` chạy
-- dưới SECURITY DEFINER, thực hiện 4 bước ATOMIC trong 1 transaction:
--   1) Trừ gem_balance người gửi + cộng gem_balance người nhận
--      (bật flag app.allow_gem_change để bypass trigger).
--   2) INSERT vào post_gifts(post_id, from_user_id, amount).
--   3) INSERT gem_transactions (action_type='gift_post', status='completed').
--   4) INSERT notifications cho chủ bài viết.
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

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
  v_recv    bigint;
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

  -- 1) Chủ bài viết
  select user_id into v_to from public.posts where id = p_post_id;
  if v_to is null then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Bài viết không tồn tại');
  end if;
  if v_to = v_from then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng quà cho mình');
  end if;

  -- Bypass trigger guard
  perform set_config('app.allow_gem_change',  '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  -- 2) Khoá & trừ gem người gửi
  select coalesce(gem_balance, 0) into v_bal
    from public.profiles where id = v_from for update;
  if v_bal < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  end if;

  select coalesce(gem_balance, 0) into v_recv
    from public.profiles where id = v_to for update;

  update public.profiles set gem_balance = v_bal  - p_amount where id = v_from;
  update public.profiles set gem_balance = v_recv + p_amount where id = v_to;

  -- 3) Ghi gem_transactions (completed — Gem đã thực sự về ví người nhận)
  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    values (v_from, v_to, p_amount, p_note, 'gift_post', p_post_id, 'completed', now())
    returning id into v_tx;
  exception when undefined_table or undefined_column then
    v_tx := null;
  end;

  -- 4) Ghi post_gifts (post-card đọc SUM từ bảng này → F5 không bị mất)
  insert into public.post_gifts(post_id, from_user_id, amount)
  values (p_post_id, v_from, p_amount)
  returning id into v_gift_id;

  -- 5) Notification cho chủ bài viết
  begin
    insert into public.notifications(user_id, type, title, message, data, is_read, created_at)
    values (
      v_to,
      'gift_post',
      '🎁 Có người tặng Gem cho bài viết của bạn',
      '+ ' || p_amount::text || ' Gem đã được cộng vào ví của bạn.',
      jsonb_build_object(
        'amount',         p_amount,
        'post_id',        p_post_id,
        'from_user_id',   v_from,
        'transaction_id', v_tx,
        'gift_id',        v_gift_id,
        'auto_settled',   true
      ),
      false,
      now()
    )
    returning id into v_notif;
  exception when undefined_table or undefined_column then
    v_notif := null;
  end;

  -- 6) Tổng Gem mới của bài viết
  select coalesce(sum(amount), 0) into v_total
    from public.post_gifts where post_id = p_post_id;

  return jsonb_build_object(
    'ok',             true,
    'transaction_id', v_tx,
    'gift_id',        v_gift_id,
    'notif_id',       v_notif,
    'amount',         p_amount,
    'total_gem',      v_total
  );
end;
$$;

revoke all on function public.gift_gem_to_post(uuid, bigint, text) from public;
grant execute on function public.gift_gem_to_post(uuid, bigint, text) to authenticated;