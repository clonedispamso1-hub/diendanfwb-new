-- =====================================================================
-- FIX: "VIDEO_NOT_FOUND" khi tặng quà Video
--
-- Nguyên nhân: frontend đọc & ghi video từ bảng public.videos_social
-- (không phải public.videos hay public.posts). RPC cũ chỉ tìm chủ video
-- ở `videos` rồi fallback `posts`, nên với video thuộc videos_social
-- nó luôn ném VIDEO_NOT_FOUND.
--
-- Fix: REPLACE function gift_candy_to_video để tìm chủ video theo thứ tự:
--   1) public.videos_social   (nguồn chính frontend đang dùng)
--   2) public.videos          (legacy)
--   3) public.posts           (legacy / fallback)
--
-- CHẠY TOÀN BỘ FILE NÀY 1 LẦN TRONG SUPABASE SQL EDITOR
-- (sau khi đã chạy 20260602_fix_gift_candy_to_video_duplicate.sql).
-- =====================================================================

-- Đảm bảo chỉ còn 1 overload (drop tất cả rồi tạo lại)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'gift_candy_to_video'
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

  -- 1) Ưu tiên videos_social (nguồn chính của feed video)
  begin
    select user_id into v_to from public.videos_social where id = p_video_id;
  exception when undefined_table then v_to := null;
  end;

  -- 2) Fallback bảng videos cũ
  if v_to is null then
    begin
      select user_id into v_to from public.videos where id = p_video_id;
    exception when undefined_table then v_to := null;
    end;
  end if;

  -- 3) Fallback posts
  if v_to is null then
    select user_id into v_to from public.posts where id = p_video_id;
  end if;

  if v_to is null then raise exception 'VIDEO_NOT_FOUND'; end if;
  if v_to = v_from then raise exception 'CANNOT_GIFT_SELF'; end if;

  -- Trừ candy người gửi (lock row)
  select candy into v_bal from public.profiles where id = v_from for update;
  if v_bal is null or v_bal < p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.profiles set candy = candy - p_amount where id = v_from;

  -- Ghi giao dịch pending
  insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status)
    values (v_from, v_to, p_amount, null, 'tip_video', p_video_id, 'pending')
    returning id into v_tx;

  -- Ghi sổ video_gifts (best effort)
  begin
    insert into public.video_gifts(video_id, sender_id, amount)
      values (p_video_id, v_from, p_amount);
  exception when others then null; end;

  -- Notify
  insert into public.notifications(user_id, type, title, message, data, is_read)
    values (
      v_to, 'gift_video',
      '🎁 Có người tặng Gem cho video của bạn',
      'Bạn được tặng ' || p_amount::text || ' Gem. Bấm "Nhận Gem" để nhận về ví.',
      jsonb_build_object(
        'video_id', p_video_id,
        'sender_id', v_from,
        'amount',    p_amount,
        'tx_id',     v_tx,
        'pending',   true
      ),
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

-- Verify còn đúng 1 overload
do $$
declare n int;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname='public' and p.proname='gift_candy_to_video';
  raise notice 'gift_candy_to_video overload count = %', n;
end $$;
