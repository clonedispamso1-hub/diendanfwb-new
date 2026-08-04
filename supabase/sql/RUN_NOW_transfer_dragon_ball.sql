-- =====================================================================
-- RPC: transfer_dragon_ball(p_to_uid text, p_tier int, p_amount int)
--   - Tìm người nhận theo profiles.public_id (KHÔNG tìm theo tên).
--   - Chuyển ownership của N viên Ngọc Rồng cấp p_tier từ auth.uid()
--     sang người nhận (update dragon_ball_instances.owner_id).
--   - Đồng bộ user_dragon_ball_inventory (nếu tồn tại).
--   - Ghi notifications realtime cho người nhận.
--   - KHÔNG tạo item mới. Chỉ chuyển ownership.
--
-- Mã lỗi:
--   NOT_AUTHENTICATED, INVALID_AMOUNT, INVALID_TIER,
--   UID_NOT_FOUND, CANNOT_TRANSFER_SELF, INSUFFICIENT_BALLS
-- =====================================================================

create or replace function public.transfer_dragon_ball(
  p_to_uid text,
  p_tier   int,
  p_amount int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from    uuid := auth.uid();
  v_to      uuid;
  v_owned   int;
  v_moved   int := 0;
  v_sender_name text;
  v_ball_name   text;
begin
  if v_from is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_tier is null or p_tier < 1 or p_tier > 7 then raise exception 'INVALID_TIER'; end if;

  -- 1) Tìm người nhận theo public_id (UID). CHỈ theo UID, không theo tên.
  select id into v_to
    from public.profiles
   where public_id = trim(p_to_uid)
   limit 1;

  if v_to is null then
    return jsonb_build_object('ok', false, 'code', 'UID_NOT_FOUND');
  end if;
  if v_to = v_from then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_TRANSFER_SELF');
  end if;

  -- 2) Đếm số viên cấp p_tier đang thuộc sở hữu người gửi
  select count(*) into v_owned
    from public.dragon_ball_instances
   where owner_id = v_from and tier = p_tier;

  if v_owned < p_amount then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALLS');
  end if;

  -- 3) Chuyển ownership N viên (KHÔNG tạo mới)
  with picked as (
    select id
      from public.dragon_ball_instances
     where owner_id = v_from and tier = p_tier
     order by created_at asc nulls last, id asc
     limit p_amount
     for update
  )
  update public.dragon_ball_instances i
     set owner_id = v_to
    from picked
   where i.id = picked.id;
  get diagnostics v_moved = row_count;

  if v_moved < p_amount then
    raise exception 'INSUFFICIENT_BALLS';
  end if;

  -- 4) Đồng bộ inventory cache (best-effort, bảng có thể không tồn tại)
  begin
    insert into public.user_dragon_ball_inventory(user_id, tier, quantity)
      values (v_from, p_tier, 0)
      on conflict (user_id, tier) do update
        set quantity = greatest(0, public.user_dragon_ball_inventory.quantity - p_amount);
    insert into public.user_dragon_ball_inventory(user_id, tier, quantity)
      values (v_to, p_tier, p_amount)
      on conflict (user_id, tier) do update
        set quantity = public.user_dragon_ball_inventory.quantity + p_amount;
  exception when undefined_table then null;
           when undefined_column then null;
  end;

  -- 5) Lấy tên người gửi
  select coalesce(nullif(display_name,''), nullif(username,''), 'Người dùng')
    into v_sender_name
    from public.profiles where id = v_from;

  v_ball_name := 'Ngọc Rồng ' || p_tier::text || ' Sao';

  -- 6) Thông báo realtime cho người nhận
  insert into public.notifications(user_id, type, title, message, data, is_read)
    values (
      v_to,
      'dragon_ball_transfer',
      '🎁 ' || v_sender_name || ' vừa gửi bạn',
      p_amount::text || ' viên ' || v_ball_name,
      jsonb_build_object(
        'sender_id',   v_from,
        'sender_name', v_sender_name,
        'tier',        p_tier,
        'amount',      p_amount
      ),
      false
    );

  -- 7) Activity log (best effort)
  begin
    insert into public.activity_logs(user_id, action_type, target_id, metadata)
      values (v_from, 'dragon_ball_send', v_to,
        jsonb_build_object('tier', p_tier, 'amount', p_amount));
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'amount', p_amount, 'tier', p_tier, 'to', v_to);
end;
$$;

revoke all on function public.transfer_dragon_ball(text, int, int) from public;
grant execute on function public.transfer_dragon_ball(text, int, int) to authenticated;