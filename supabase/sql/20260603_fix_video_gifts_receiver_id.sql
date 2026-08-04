-- =====================================================================
-- FIX: 23502 null value in column "receiver_id" of relation "video_gifts"
--
-- Bảng public.video_gifts đã thêm cột receiver_id NOT NULL nhưng RPC
-- public.gift_candy_to_video vẫn insert thiếu cột này → mọi lượt tặng
-- quà cho video crash ngay tại bước ghi sổ.
--
-- Fix: REPLACE gift_candy_to_video, thêm receiver_id = v_to vào câu
-- INSERT video_gifts. Vẫn tìm chủ video theo thứ tự
-- videos_social → videos → posts như bản fix trước.
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

  perform set_config('app.allow_candy_change', '1', true);

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

  select candy into v_bal from public.profiles where id = v_from for update;
  if v_bal is null or v_bal < p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.profiles set candy = candy - p_amount where id = v_from;

  insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status)
    values (v_from, v_to, p_amount, null, 'tip_video', p_video_id, 'pending')
    returning id into v_tx;

  -- ✅ FIX: thêm receiver_id để thoả NOT NULL constraint
  -- Dùng dynamic SQL để tự nhận biết schema video_gifts (có/không cột receiver_id)
  begin
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='video_gifts' and column_name='receiver_id'
    ) then
      insert into public.video_gifts(video_id, sender_id, receiver_id, amount)
        values (p_video_id, v_from, v_to, p_amount);
    else
      insert into public.video_gifts(video_id, sender_id, amount)
        values (p_video_id, v_from, p_amount);
    end if;
  exception when undefined_table then null;
  end;

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