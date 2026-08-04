-- =====================================================================
-- FIX KHẨN: Lỗi PostgREST khi bấm "Tặng quà" cho Video
--   Could not choose the best candidate function between:
--     public.gift_candy_to_video(p_amount => integer, p_video_id => uuid)
--     public.gift_candy_to_video(p_video_id => uuid, p_amount => integer)
--
-- Nguyên nhân: trong database đang tồn tại 2 overload cùng tên
-- gift_candy_to_video với CÙNG tên tham số nhưng KHÁC thứ tự khai báo.
-- PostgREST không thể xác định gọi cái nào khi client dùng named args.
--
-- Cách xử lý: DROP TẤT CẢ overload hiện có của public.gift_candy_to_video,
-- sau đó CREATE DUY NHẤT 1 phiên bản chuẩn với chữ ký mà frontend đang gọi:
--   gift_candy_to_video(p_video_id uuid, p_amount bigint)
--
-- CHẠY TOÀN BỘ FILE NÀY 1 LẦN TRONG SUPABASE SQL EDITOR.
-- =====================================================================

-- (Tuỳ chọn) Liệt kê các overload đang tồn tại trước khi sửa:
-- select p.oid::regprocedure
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and p.proname='gift_candy_to_video';

-- 1) DROP toàn bộ overload của gift_candy_to_video (mọi thứ tự / kiểu tham số)
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

-- 2) CREATE phiên bản chuẩn DUY NHẤT
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

  -- Tìm chủ video: ưu tiên bảng videos, fallback sang posts
  begin
    select user_id into v_to from public.videos where id = p_video_id;
  exception when undefined_table then v_to := null;
  end;
  if v_to is null then
    select user_id into v_to from public.posts where id = p_video_id;
  end if;
  if v_to is null then raise exception 'VIDEO_NOT_FOUND'; end if;
  if v_to = v_from then raise exception 'CANNOT_GIFT_SELF'; end if;

  -- Trừ candy người gửi
  select candy into v_bal from public.profiles where id = v_from for update;
  if v_bal is null or v_bal < p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.profiles set candy = candy - p_amount where id = v_from;

  -- Ghi giao dịch pending (người nhận phải bấm "Nhận Gem")
  insert into public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status)
    values (v_from, v_to, p_amount, null, 'tip_video', p_video_id, 'pending')
    returning id into v_tx;

  -- Ghi sổ vào video_gifts (nếu bảng tồn tại) — best effort
  begin
    insert into public.video_gifts(video_id, sender_id, amount)
      values (p_video_id, v_from, p_amount);
  exception when others then null; end;

  -- Tạo thông báo cho người nhận
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

  -- Log hoạt động (best effort)
  begin
    insert into public.activity_logs(user_id, action_type, target_id, metadata)
      values (v_from, 'gem_send', v_to,
        jsonb_build_object('amount', p_amount, 'video_id', p_video_id, 'tx', v_tx, 'pending', true));
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'tx_id', v_tx, 'notif_id', v_notif, 'status', 'pending');
end;
$$;

grant execute on function public.gift_candy_to_video(uuid, bigint) to authenticated;

-- 3) Kiểm chứng: phải còn đúng 1 overload
do $$
declare n int;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname='public' and p.proname='gift_candy_to_video';
  raise notice 'gift_candy_to_video overload count = %', n;
  if n <> 1 then
    raise exception 'FIX FAILED: vẫn còn % overload', n;
  end if;
end $$;
