-- RUN ON SUPABASE #1 ONLY
-- =============================================================================
-- HOTFIX 2026-08-23 — my_cash_flow() đúng schema thật + siết bảo mật admin
--                     + expire_pending_withdrawals() KHÔNG ghi notifications.
-- Idempotent. KHÔNG chạy lại migration trước.
--
-- Cột THẬT đã kiểm tra trên SB1:
--   public.gem_transactions(id, client_request_id, sender_id, receiver_id,
--                           amount, kind, sender_balance_after,
--                           receiver_balance_after, created_at)
--     → KHÔNG có from_id/to_id/post_id/action_type/note.
--   public.transfer_transactions(id, sender_id, receiver_id, amount, fee,
--                               net_amount, note, status, claimed_at, created_at)
--   public.withdrawal_requests(id, code, user_id, amount, fee, net_amount,
--                              bank_name, bank_account, account_holder, status,
--                              note, admin_note, reviewed_by, reviewed_at,
--                              processed_at, created_at)
--   public.profiles(id, is_admin, role, public_id, ...)
--   public.notifications KHÔNG tồn tại trên SB1 (nằm ở SB#3).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) GUARD ADMIN — luôn tồn tại, luôn FAIL-CLOSED
-- -----------------------------------------------------------------------------
create or replace function public._is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_admin = true
             or coalesce(p.role, '') in ('admin', 'super_admin', 'moderator')
        from public.profiles p
       where p.id = auth.uid()
    ),
    false
  )
     or exists (
       select 1
         from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role::text in ('admin', 'super_admin', 'moderator')
     );
$$;

grant execute on function public._is_current_admin() to authenticated;

create or replace function public._admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public._is_current_admin() then
    raise exception 'FORBIDDEN: chỉ Admin mới được thực hiện thao tác này'
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function public._admin_guard() to authenticated;

-- -----------------------------------------------------------------------------
-- 1) review_withdrawal_request — FAIL CLOSED (không còn bỏ qua guard)
--    Logic tài chính giữ nguyên: từ chối = hoàn xu.
-- -----------------------------------------------------------------------------
create or replace function public.review_withdrawal_request(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_amount bigint;
  v_status text;
  v_code   text;
begin
  perform public._admin_guard();   -- KHÔNG bọc exception: thiếu quyền = từ chối

  select w.user_id, w.amount, w.status, w.code
    into v_user, v_amount, v_status, v_code
    from public.withdrawal_requests w
   where w.id = p_id
   for update;

  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND',
                              'message', 'Không tìm thấy yêu cầu rút tiền.');
  end if;
  if v_status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REVIEWED',
                              'message', 'Yêu cầu này đã được xử lý.');
  end if;

  update public.withdrawal_requests w
     set status       = case when p_approve then 'approved' else 'rejected' end,
         note         = p_note,
         admin_note   = p_note,
         reviewed_by  = auth.uid(),
         reviewed_at  = now(),
         processed_at = now()
   where w.id = p_id;

  if not p_approve then
    update public.profiles p
       set gem_balance = coalesce(p.gem_balance, 0) + v_amount
     where p.id = v_user;
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve,
                            'code', v_code, 'amount', v_amount);
end;
$$;

revoke all on function public.review_withdrawal_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_withdrawal_request(uuid, boolean, text) to authenticated;
grant execute on function public.review_withdrawal_request(uuid, boolean, text) to service_role;

-- -----------------------------------------------------------------------------
-- 2) admin_list_withdrawal_requests — FAIL CLOSED
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_withdrawal_requests(p_status text default null)
returns table (
  id uuid, code text, user_id uuid, amount bigint, fee bigint, net_amount bigint,
  bank_name text, bank_account text, account_holder text, status text,
  note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();   -- KHÔNG bọc exception

  return query
  select w.id, w.code, w.user_id, w.amount, w.fee, w.net_amount,
         w.bank_name, w.bank_account, w.account_holder, w.status,
         coalesce(w.note, w.admin_note) as note, w.reviewed_by,
         coalesce(w.reviewed_at, w.processed_at) as reviewed_at, w.created_at
    from public.withdrawal_requests w
   where (p_status is null or btrim(p_status) = '' or w.status = p_status)
   order by w.created_at desc
   limit 500;
end;
$$;

revoke all on function public.admin_list_withdrawal_requests(text) from public, anon;
grant execute on function public.admin_list_withdrawal_requests(text) to authenticated;
grant execute on function public.admin_list_withdrawal_requests(text) to service_role;

-- -----------------------------------------------------------------------------
-- 3) expire_pending_withdrawals() — KHÔNG ghi notifications trên SB1
--    Logic hoàn xu giữ nguyên 100%.
-- -----------------------------------------------------------------------------
create or replace function public.expire_pending_withdrawals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
  v_today_start timestamptz := date_trunc(
    'day', now() at time zone 'Asia/Ho_Chi_Minh'
  ) at time zone 'Asia/Ho_Chi_Minh';
begin
  for r in
    select w.id, w.user_id, w.amount, w.code
      from public.withdrawal_requests w
     where w.status = 'pending'
       and w.created_at < v_today_start
     for update
  loop
    update public.profiles p
       set gem_balance = coalesce(p.gem_balance, 0) + r.amount
     where p.id = r.user_id;

    update public.withdrawal_requests w
       set status       = 'refunded',
           note         = coalesce(w.note, 'Hết hạn — hệ thống tự hoàn xu'),
           admin_note   = coalesce(w.admin_note, 'Hết hạn — hệ thống tự hoàn xu'),
           processed_at = now(),
           reviewed_at  = coalesce(w.reviewed_at, now())
     where w.id = r.id;

    -- KIẾN TRÚC: SB1 KHÔNG BAO GIỜ ghi public.notifications (bảng ở SB#3).
    -- Thông báo cho thành viên do tầng ứng dụng / SB#3 phát hành.
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.expire_pending_withdrawals() from public, anon, authenticated;
grant execute on function public.expire_pending_withdrawals() to service_role;

-- -----------------------------------------------------------------------------
-- 4) my_cash_flow() — dựng lại theo CỘT THẬT
--    Gồm: rút tiền (kèm status), chuyển xu đi, nhận xu về — 3 ngày gần nhất.
--    Loại trừ: quà tặng bài viết & mọi bút toán quà/tip/admin trong
--              gem_transactions (kind chứa 'gift'/'tip'/'admin'/'post').
-- -----------------------------------------------------------------------------
drop function if exists public.my_cash_flow();
drop function if exists public.my_cash_flow(integer);

create or replace function public.my_cash_flow(p_days integer default 3)
returns table (
  kind       text,          -- 'withdraw' | 'transfer_out' | 'transfer_in'
  id         text,
  code       text,
  amount     bigint,
  fee        bigint,
  net_amount bigint,
  status     text,
  note       text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_days  integer := greatest(1, least(coalesce(p_days, 3), 30));
  v_since timestamptz;
begin
  if v_uid is null then
    return;   -- chưa đăng nhập → danh sách rỗng, không lộ lỗi kỹ thuật
  end if;

  v_since := now() - make_interval(days => v_days);

  return query
  with rows_all as (
    -- 4.1 Rút tiền (kèm trạng thái)
    select 'withdraw'::text                     as kind,
           w.id::text                           as id,
           w.code                               as code,
           w.amount                             as amount,
           coalesce(w.fee, 0)::bigint           as fee,
           coalesce(w.net_amount, w.amount)::bigint as net_amount,
           w.status                             as status,
           coalesce(w.note, w.admin_note)       as note,
           w.created_at                         as created_at
      from public.withdrawal_requests w
     where w.user_id = v_uid
       and w.created_at >= v_since

    union all

    -- 4.2 Chuyển xu (sổ chuyển tiền) — đã tách khỏi quà tặng bài viết
    select case when t.sender_id = v_uid then 'transfer_out' else 'transfer_in' end::text,
           t.id::text,
           null::text,
           t.amount,
           coalesce(t.fee, 0)::bigint,
           coalesce(t.net_amount, t.amount)::bigint,
           coalesce(t.status, 'completed'),
           t.note,
           t.created_at
      from public.transfer_transactions t
     where (t.sender_id = v_uid or t.receiver_id = v_uid)
       and t.created_at >= v_since

    union all

    -- 4.3 Chuyển xu ghi trong sổ cái ví (sender_id / receiver_id là cột THẬT).
    --     Loại trừ quà tặng bài viết, tip và bút toán admin.
    select case when g.sender_id = v_uid then 'transfer_out' else 'transfer_in' end::text,
           g.id::text,
           null::text,
           g.amount,
           0::bigint,
           g.amount,
           'completed'::text,
           null::text,
           g.created_at
      from public.gem_transactions g
     where (g.sender_id = v_uid or g.receiver_id = v_uid)
       and g.created_at >= v_since
       and coalesce(g.kind, '') not ilike '%gift%'
       and coalesce(g.kind, '') not ilike '%tip%'
       and coalesce(g.kind, '') not ilike '%post%'
       and coalesce(g.kind, '') not ilike 'admin%'
  )
  select r.kind, r.id, r.code, r.amount, r.fee, r.net_amount,
         r.status, r.note, r.created_at
    from rows_all r
   order by r.created_at desc
   limit 300;
end;
$$;

revoke all on function public.my_cash_flow(integer) from public, anon;
grant execute on function public.my_cash_flow(integer) to authenticated;

commit;

-- Kiểm tra nhanh sau khi chạy:
--   select * from public.my_cash_flow();            -- user thường: chỉ thấy của mình
--   select public._is_current_admin();              -- true chỉ với admin
--   select * from public.admin_list_withdrawal_requests();  -- user thường → FORBIDDEN
