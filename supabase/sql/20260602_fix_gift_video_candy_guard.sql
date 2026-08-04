-- =====================================================================
-- FIX: "Giao dịch không thể thực hiện. Vui lòng thử lại."
--
-- Nguyên nhân: trigger profiles_block_privileged_columns chặn mọi UPDATE
-- cột `candy` trên public.profiles nếu session flag
-- `app.allow_candy_change` != '1'. RPC gift_candy_to_video chưa set flag
-- này → khi trừ candy người gửi, trigger ném exception generic.
--
-- Fix: thêm perform set_config('app.allow_candy_change','1', true)
-- ở đầu function (giống transfer_gem_secure). Flag chỉ tồn tại trong
-- transaction nội bộ của RPC SECURITY DEFINER → an toàn, không rò rỉ.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='gift_candy_to_video'
  loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

create or replace function public.gift_candy_to_video(
  p_video_id uuid,
  p_amount   bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from  uuid := auth.uid();
  v_to    uuid;
  v_bal   bigint;
  v_tx    uuid;
  v_notif uuid;
begin
  if v_from is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- BẬT flag bypass candy-guard CHỈ trong transaction nội bộ này
  perform set_config('app.allow_candy_change', '1', true);

  -- Tìm chủ video: videos_social → videos → posts
  begin
    select user_id into v_to from public.videos_social where id = p_video_id;
  exception when undefined_table then v_to := null;
  end;
  if v_to is null then
    begin
      select user_id into v_to from public.videos where id = p_video_id;
    exception when undefined_table then v_to := null;
    end;
  end if;
  if v_to is null then
    select user_id into v_to from public.posts where id = p_video_id;
  end if;
  if v_to is null then raise exception 'VIDEO_NOT_FOUND'; end if;
  if v_to = v_from then raise exception 'CANNOT_GIFT_SELF'; end if;

  -- Trừ candy người gửi
  select candy into v_bal from public.profiles where id = v_from for update;
  if v_bal is null or v_bal < p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.profiles set candy = candy - p_amount where id = v_from;

  -- Giao dịch pending (người nhận bấm "Nhận Gem" để cộng)
  insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status)
    values (v_from, v_to, p_amount, null, 'tip_video', p_video_id, 'pending')
    returning id into v_tx;

  begin
    insert into public.video_gifts(video_id, sender_id, amount)
      values (p_video_id, v_from, p_amount);
  exception when others then null; end;

  insert into public.notifications(user_id, type, title, message, data, is_read)
    values (
      v_to, 'gift_video',
      '🎁 Có người tặng Gem cho video của bạn',
      'Bạn được tặng ' || p_amount::text || ' Gem. Bấm "Nhận Gem" để nhận về ví.',
      jsonb_build_object('video_id', p_video_id, 'sender_id', v_from,
                         'amount', p_amount, 'tx_id', v_tx, 'pending', true),
      false
    )
    returning id into v_notif;

  begin
    insert into public.activity_logs(user_id, action_type, target_id, metadata)
      values (v_from, 'gem_send', v_to,
        jsonb_build_object('amount', p_amount, 'video_id', p_video_id, 'tx', v_tx, 'pending', true));
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'tx_id', v_tx, 'notif_id', v_notif, 'status', 'pending');
end;
$$;

grant execute on function public.gift_candy_to_video(uuid, bigint) to authenticated;
