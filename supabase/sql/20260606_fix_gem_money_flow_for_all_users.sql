-- =====================================================================
-- FIX GEM MONEY FLOW — all authenticated users, real balance updates
--
-- 1) Any signed-in user may gift/transfer Gem via SECURITY DEFINER RPCs.
-- 2) Sender balance is debited atomically and returned as new_balance.
-- 3) Pending gift claim credits receiver atomically and returns new_balance.
-- 4) No client-side UPDATE to profiles.gem_balance is required or allowed.
-- =====================================================================

create or replace function public.profiles_block_gem_balance_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allow text;
  v_role text;
begin
  begin
    v_allow := current_setting('app.allow_gem_change', true);
  exception when others then
    v_allow := null;
  end;

  if coalesce(v_allow, '') = '1' then
    return new;
  end if;

  begin
    v_role := auth.role();
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role' then
    return new;
  end if;

  if new.gem_balance is distinct from old.gem_balance then
    raise exception 'Không được phép sửa gem_balance từ client' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_block_gem_balance_client on public.profiles;
create trigger trg_profiles_block_gem_balance_client
  before update of gem_balance on public.profiles
  for each row
  execute function public.profiles_block_gem_balance_client();

create or replace function public.secure_transfer_gem(
  p_receiver_id uuid,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_sender_balance bigint;
  v_receiver_balance bigint;
  v_sender_new_balance bigint;
  v_receiver_new_balance bigint;
  v_tx_id uuid;
begin
  if v_sender is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  end if;
  if p_receiver_id is null or p_receiver_id = v_sender then
    return jsonb_build_object('ok', false, 'code', 'INVALID_RECIPIENT', 'message', 'Người nhận không hợp lệ');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  end if;

  perform set_config('app.allow_gem_change', '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  select coalesce(gem_balance, 0) into v_sender_balance
    from public.profiles where id = v_sender for update;
  if v_sender_balance is null then
    return jsonb_build_object('ok', false, 'code', 'SENDER_NOT_FOUND', 'message', 'Không tìm thấy người gửi');
  end if;
  if v_sender_balance < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  end if;

  select coalesce(gem_balance, 0) into v_receiver_balance
    from public.profiles where id = p_receiver_id for update;
  if v_receiver_balance is null then
    return jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không tìm thấy người nhận');
  end if;

  update public.profiles
     set gem_balance = v_sender_balance - p_amount
   where id = v_sender
   returning gem_balance into v_sender_new_balance;

  update public.profiles
     set gem_balance = v_receiver_balance + p_amount
   where id = p_receiver_id
   returning gem_balance into v_receiver_new_balance;

  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, status, created_at)
    values (v_sender, p_receiver_id, p_amount, p_note, 'transfer', 'completed', now())
    returning id into v_tx_id;
  exception when undefined_table or undefined_column then
    v_tx_id := null;
  end;

  begin
    insert into public.notifications(user_id, type, title, message, data, is_read, created_at)
    values (
      p_receiver_id,
      'transfer_gem',
      '💎 Bạn vừa nhận Gem',
      'Bạn nhận được ' || p_amount::text || ' Gem.',
      jsonb_build_object(
        'amount', p_amount,
        'sender_id', v_sender,
        'transaction_id', v_tx_id,
        'status', 'completed',
        'auto_settled', true
      ),
      false,
      now()
    );
  exception when undefined_table or undefined_column then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'tx_id', v_tx_id,
    'amount', p_amount,
    'new_balance', v_sender_new_balance,
    'sender_new_balance', v_sender_new_balance,
    'receiver_new_balance', v_receiver_new_balance
  );
end;
$$;

revoke all on function public.secure_transfer_gem(uuid, bigint, text) from public;
grant execute on function public.secure_transfer_gem(uuid, bigint, text) to authenticated;

create or replace function public.gift_gem_to_post_v2(
  p_post_id uuid,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_to uuid;
  v_sender_balance bigint;
  v_sender_new_balance bigint;
  v_tx uuid;
  v_gift_id uuid;
  v_notif uuid;
  v_total bigint;
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

  perform set_config('app.allow_gem_change', '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  select coalesce(gem_balance, 0) into v_sender_balance
    from public.profiles where id = v_from for update;
  if v_sender_balance is null then
    return jsonb_build_object('ok', false, 'code', 'SENDER_NOT_FOUND', 'message', 'Không tìm thấy người gửi');
  end if;
  if v_sender_balance < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  end if;

  update public.profiles
     set gem_balance = v_sender_balance - p_amount
   where id = v_from
   returning gem_balance into v_sender_new_balance;

  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    values (v_from, v_to, p_amount, 'Tặng Gem cho bài viết', 'gift_post', p_post_id, 'pending', now())
    returning id into v_tx;
  exception when undefined_table or undefined_column then
    v_tx := null;
  end;

  begin
    insert into public.post_gifts(post_id, from_user_id, amount)
    values (p_post_id, v_from, p_amount)
    returning id into v_gift_id;
  exception when undefined_table or undefined_column then
    v_gift_id := null;
  end;

  begin
    insert into public.notifications(user_id, type, title, message, data, is_read, created_at)
    values (
      v_to,
      'gift_post',
      '🎁 Có người tặng Gem cho bài viết của bạn',
      'Bấm Nhận để cộng ' || p_amount::text || ' Gem vào ví của bạn.',
      jsonb_build_object(
        'amount', p_amount,
        'post_id', p_post_id,
        'sender_id', v_from,
        'from_user_id', v_from,
        'transaction_id', v_tx,
        'gift_id', v_gift_id,
        'status', 'pending',
        'auto_settled', false
      ),
      false,
      now()
    )
    returning id into v_notif;
  exception when undefined_table or undefined_column then
    v_notif := null;
  end;

  begin
    select coalesce(sum(amount), 0) into v_total from public.post_gifts where post_id = p_post_id;
  exception when undefined_table or undefined_column then
    v_total := p_amount;
  end;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx,
    'gift_id', v_gift_id,
    'notif_id', v_notif,
    'amount', p_amount,
    'new_balance', v_sender_new_balance,
    'sender_new_balance', v_sender_new_balance,
    'total_gem', v_total,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.gift_gem_to_post_v2(uuid, bigint) from public;
grant execute on function public.gift_gem_to_post_v2(uuid, bigint) to authenticated;

create or replace function public.gift_gem_to_video(
  p_video_id uuid,
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
  v_to uuid;
  v_sender_balance bigint;
  v_sender_new_balance bigint;
  v_tx uuid;
  v_gift_id uuid;
  v_notif uuid;
  v_total bigint;
begin
  if v_from is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  end if;

  begin
    select user_id into v_to from public.videos_social where id = p_video_id;
  exception when undefined_table or undefined_column then
    v_to := null;
  end;
  if v_to is null then
    begin
      select user_id into v_to from public.videos where id = p_video_id;
    exception when undefined_table or undefined_column then
      v_to := null;
    end;
  end if;
  if v_to is null then
    begin
      select user_id into v_to from public.posts where id = p_video_id;
    exception when undefined_table or undefined_column then
      v_to := null;
    end;
  end if;

  if v_to is null then
    return jsonb_build_object('ok', false, 'code', 'VIDEO_NOT_FOUND', 'message', 'Video không tồn tại');
  end if;
  if v_to = v_from then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng quà cho mình');
  end if;

  perform set_config('app.allow_gem_change', '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  select coalesce(gem_balance, 0) into v_sender_balance
    from public.profiles where id = v_from for update;
  if v_sender_balance is null then
    return jsonb_build_object('ok', false, 'code', 'SENDER_NOT_FOUND', 'message', 'Không tìm thấy người gửi');
  end if;
  if v_sender_balance < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem');
  end if;

  update public.profiles
     set gem_balance = v_sender_balance - p_amount
   where id = v_from
   returning gem_balance into v_sender_new_balance;

  begin
    insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    values (v_from, v_to, p_amount, coalesce(p_note, 'Tặng Gem cho video'), 'gift_video', p_video_id, 'pending', now())
    returning id into v_tx;
  exception when undefined_table or undefined_column then
    v_tx := null;
  end;

  begin
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'video_gifts' and column_name = 'receiver_id'
    ) then
      insert into public.video_gifts(video_id, sender_id, receiver_id, amount)
      values (p_video_id, v_from, v_to, p_amount)
      returning id into v_gift_id;
    else
      insert into public.video_gifts(video_id, sender_id, amount)
      values (p_video_id, v_from, p_amount)
      returning id into v_gift_id;
    end if;
  exception when undefined_table or undefined_column then
    v_gift_id := null;
  end;

  begin
    insert into public.notifications(user_id, type, title, message, data, is_read, created_at)
    values (
      v_to,
      'gift_video',
      '🎁 Có người tặng Gem cho video của bạn',
      'Bấm Nhận để cộng ' || p_amount::text || ' Gem vào ví của bạn.',
      jsonb_build_object(
        'amount', p_amount,
        'video_id', p_video_id,
        'sender_id', v_from,
        'from_user_id', v_from,
        'transaction_id', v_tx,
        'gift_id', v_gift_id,
        'status', 'pending',
        'auto_settled', false
      ),
      false,
      now()
    )
    returning id into v_notif;
  exception when undefined_table or undefined_column then
    v_notif := null;
  end;

  begin
    select coalesce(sum(amount), 0) into v_total from public.video_gifts where video_id = p_video_id;
  exception when undefined_table or undefined_column then
    v_total := p_amount;
  end;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx,
    'gift_id', v_gift_id,
    'notif_id', v_notif,
    'amount', p_amount,
    'new_balance', v_sender_new_balance,
    'sender_new_balance', v_sender_new_balance,
    'total_gem', v_total,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.gift_gem_to_video(uuid, bigint, text) from public;
grant execute on function public.gift_gem_to_video(uuid, bigint, text) to authenticated;

create or replace function public.claim_gift_gem_notification(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_notif public.notifications%rowtype;
  v_amount bigint;
  v_status text;
  v_tx_text text;
  v_tx_id uuid;
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

  v_amount := coalesce(nullif(regexp_replace(coalesce(v_notif.data->>'amount', '0'), '[^0-9]', '', 'g'), '')::bigint, 0);
  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  end if;

  perform set_config('app.allow_gem_change', '1', true);
  perform set_config('app.allow_candy_change', '1', true);

  update public.profiles
     set gem_balance = coalesce(gem_balance, 0) + v_amount
   where id = v_me
   returning gem_balance into v_new_bal;

  update public.notifications
     set is_read = true,
         data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
           'status', 'completed',
           'auto_settled', true,
           'claimed_at', to_jsonb(now()),
           'new_balance', v_new_bal
         )
   where id = p_notification_id;

  v_tx_text := coalesce(nullif(v_notif.data->>'transaction_id', ''), nullif(v_notif.data->>'tx_id', ''), nullif(v_notif.data->>'tx', ''));
  if v_tx_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_tx_id := v_tx_text::uuid;
    begin
      update public.gem_transactions set status = 'completed' where id = v_tx_id;
    exception when undefined_table or undefined_column then
      null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'amount', v_amount, 'new_balance', v_new_bal);
end;
$$;

revoke all on function public.claim_gift_gem_notification(uuid) from public;
grant execute on function public.claim_gift_gem_notification(uuid) to authenticated;

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