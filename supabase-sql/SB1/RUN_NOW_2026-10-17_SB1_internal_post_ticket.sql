-- =====================================================================
-- CHẠY TRÊN SUPABASE 1, SAU các file post_ticket ngày 15–16/10. An toàn chạy lại.
-- KHÔNG đổi phí, KHÔNG đổi lượt miễn phí, KHÔNG đổi reserve_post_slot, KHÔNG đổi khoá ký.
--
-- Thêm vé "internal" cho Admin Panel → Tài khoản thứ hai:
--   • Chỉ Super Admin (kiểm tra bằng auth.uid() ở server, không tin dữ liệu client).
--   • Chỉ cấp cho đúng tài khoản thứ hai (profiles.account_source = 'internal',
--     không phải admin). Vé gắn chặt với id tài khoản đó.
--   • KHÔNG đụng post_quota / post_charges / gem_balance → không trừ lượt, không trừ gem.
--   • Vé hết hạn sau 10 phút và chỉ dùng được 1 lần (Supabase 3 ghi sổ).
-- =====================================================================

create or replace function public.reserve_internal_post_ticket(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_secret text;
  v_msg text;
begin
  if v_uid is null or not public._is_super_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin được dùng chức năng này');
  end if;
  if p_account_id is null or not exists (
    select 1 from public.profiles pr
     where pr.id = p_account_id
       and pr.account_source = 'internal'
       and coalesce((to_jsonb(pr)->>'is_admin')::boolean, false) = false
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_INTERNAL', 'message', 'Không phải tài khoản thứ hai');
  end if;

  select secret into v_secret from private.post_ticket_secret where id;
  if v_secret is null then
    return jsonb_build_object('ok', false, 'code', 'NO_KEY', 'message', 'Chưa cấu hình khoá vé');
  end if;
  -- nonce.account.internal.exp.sig  (cùng định dạng 5 phần với vé thường)
  v_msg := gen_random_uuid()::text || '.' || p_account_id::text || '.internal.'
           || floor(extract(epoch from now() + interval '10 minutes'))::bigint::text;
  return jsonb_build_object('ok', true, 'kind', 'internal',
    'ticket', v_msg || '.' || encode(extensions.hmac(v_msg, v_secret, 'sha256'), 'hex'));
end; $$;

revoke all on function public.reserve_internal_post_ticket(uuid) from public, anon;
grant execute on function public.reserve_internal_post_ticket(uuid) to authenticated;
