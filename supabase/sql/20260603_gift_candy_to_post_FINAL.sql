-- =============================================================
-- FINAL FIX — gift_candy_to_post
-- DB: zbuwddjcqdlyijcunwgd (Supabase SQL Editor)
--
-- SCHEMA THẬT của public.post_gifts (đã verify bằng):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='post_gifts'
--   ORDER BY ordinal_position;
--
-- => cột người gửi là `from_user_id` (KHÔNG phải `sender_id`).
--
-- File này:
--   1) Tạo lại RPC public.gift_candy_to_post dùng đúng `from_user_id`.
--   2) BỎ "exception when others then null" — lỗi sẽ surface lên client.
--   3) Insert 1 dòng / 1 lần tặng vào public.post_gifts.
--   4) Tổng Gem = SUM(amount) FROM public.post_gifts WHERE post_id = ?
--      -> đọc trực tiếp DB, không cache frontend.
--
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
-- =============================================================

create or replace function public.gift_candy_to_post(
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
  v_tx      uuid;
  v_notif   uuid;
  v_gift_id uuid;
begin
  if v_from is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- 1) Chủ bài viết
  select user_id into v_to from public.posts where id = p_post_id;
  if v_to is null then raise exception 'POST_NOT_FOUND'; end if;
  if v_to = v_from then raise exception 'CANNOT_GIFT_SELF'; end if;

  -- Cho phép RPC tin cậy trừ Gem qua trigger profiles_block_privileged_columns.
  -- Thiếu flag này sẽ bị rollback với lỗi "Giao dịch không thể/chưa được thực hiện".
  perform set_config('app.allow_candy_change', '1', true);

  -- 2) Trừ candy của người gửi (lock row)
  select candy into v_bal from public.profiles where id = v_from for update;
  if v_bal is null or v_bal < p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update public.profiles set candy = candy - p_amount where id = v_from;

  -- 3) Ghi transaction tổng (pending → user nhận bấm "Nhận Gem" mới settle)
  insert into public.gem_transactions(
    from_id, to_id, amount, note, action_type, post_id, status
  ) values (
    v_from, v_to, p_amount, null, 'tip_post', p_post_id, 'pending'
  )
  returning id into v_tx;

  -- 4) ✅ INSERT vào public.post_gifts theo SCHEMA THẬT.
  --    Cột người gửi = `from_user_id`. KHÔNG dùng `sender_id`.
  --    Không bọc exception — nếu fail thì cả transaction rollback,
  --    candy hoàn lại, lỗi surface ra client.
  insert into public.post_gifts(post_id, from_user_id, amount)
  values (p_post_id, v_from, p_amount)
  returning id into v_gift_id;

  -- 5) Notification cho người nhận
  insert into public.notifications(user_id, type, title, message, data, is_read)
  values (
    v_to,
    'gift_post',
    '🎁 Có người tặng Gem cho bài viết của bạn',
    'Bạn được tặng ' || p_amount::text || ' Gem. Bấm "Nhận Gem" để nhận về ví.',
    jsonb_build_object(
      'transaction_id', v_tx,
      'gift_id',        v_gift_id,
      'amount',         p_amount,
      'post_id',        p_post_id,
      'from_user_id',   v_from,
      'pending',        true
    ),
    false
  )
  returning id into v_notif;

  -- 6) Activity log (best-effort; nếu bảng/cột không có cũng không phá flow chính)
  begin
    insert into public.activity_logs(user_id, action_type, target_id, metadata)
    values (
      v_from, 'gem_send', v_to,
      jsonb_build_object(
        'amount',         p_amount,
        'post_id',        p_post_id,
        'transaction_id', v_tx,
        'gift_id',        v_gift_id,
        'pending',        true
      )
    );
  exception when undefined_table or undefined_column then
    -- chỉ nuốt khi bảng/cột không tồn tại; KHÔNG nuốt lỗi insert post_gifts
    null;
  end;

  return jsonb_build_object(
    'ok',             true,
    'transaction_id', v_tx,
    'gift_id',        v_gift_id,
    'notif_id',       v_notif,
    'status',         'pending'
  );
end;
$$;

grant execute on function public.gift_candy_to_post(uuid, bigint) to authenticated;

-- =============================================================
-- DEBUG QUERIES — chạy sau khi deploy để verify
-- =============================================================
-- A) In schema thật của post_gifts (lý do file này tồn tại):
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='post_gifts'
--   ORDER BY ordinal_position;
--
-- B) Sau khi tặng 100 + 100 + 500 vào cùng 1 post:
--
--   SELECT id, post_id, from_user_id, amount, created_at
--   FROM public.post_gifts
--   WHERE post_id = '<POST_ID>'
--   ORDER BY created_at DESC;
--   -- phải có ĐÚNG 3 dòng: 100, 100, 500
--
--   SELECT COALESCE(SUM(amount), 0) AS total_gem
--   FROM public.post_gifts
--   WHERE post_id = '<POST_ID>';
--   -- phải = 700
-- =============================================================
