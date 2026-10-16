-- HOÀN TÁC PROPOSED_2026-10-19_SB3_exempt_ticket_fix.sql — CHẠY TRÊN SUPABASE 3.
-- Khôi phục nguyên văn hàm private.enforce_post_ticket() của bản 2026-10-17 (nhánh exempt dùng lại has_role).
-- Các dòng đã ghi vào private.used_post_charges được giữ lại (vé exempt đã dùng vẫn không dùng lại được).
begin;
create or replace function private.enforce_post_ticket()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_parts text[];
  v_msg text;
  v_uid text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub';
  v_charge uuid;
begin
  if private.post_ticket_trusted_caller() then
    NEW.post_ticket := null;
    return NEW;
  end if;
  if NEW.category::text = 'feedback' or NEW.visibility::text = 'feedback' then
    NEW.post_ticket := null;
    NEW.post_charge_id := null;
    return NEW;
  end if;

  if NEW.post_ticket is null then
    raise exception 'POST_TICKET_REQUIRED: Bài đăng cần lượt miễn phí hoặc thanh toán.';
  end if;
  v_parts := string_to_array(NEW.post_ticket, '.');
  if coalesce(array_length(v_parts, 1), 0) <> 5 then
    raise exception 'POST_TICKET_INVALID';
  end if;
  select secret into v_secret from private.post_ticket_secret where id;
  if v_secret is null or v_secret = 'DAN_KHOA_TU_SUPABASE_1' then
    raise exception 'POST_TICKET_INVALID: chưa cấu hình khoá';
  end if;
  v_msg := v_parts[1] || '.' || v_parts[2] || '.' || v_parts[3] || '.' || v_parts[4];
  if encode(extensions.hmac(v_msg, v_secret, 'sha256'), 'hex') <> v_parts[5] then
    raise exception 'POST_TICKET_INVALID';
  end if;
  if v_parts[4] !~ '^[0-9]+$' or v_parts[4]::bigint < floor(extract(epoch from now()))::bigint then
    raise exception 'POST_TICKET_EXPIRED: Vui lòng đăng lại.';
  end if;

  -- MỚI: vé nội bộ cho Tài khoản thứ hai (phần 2 = id tài khoản thứ hai, không phải người gọi).
  if v_parts[3] = 'internal' then
    if NEW.user_id::text <> v_parts[2] then
      raise exception 'POST_TICKET_INVALID';
    end if;
    insert into private.used_post_charges(charge_id, post_id) values (v_parts[1]::uuid, NEW.id)
    on conflict (charge_id) do nothing;
    if not found then
      raise exception 'POST_TICKET_USED';
    end if;
    NEW.post_charge_id := null;
    NEW.post_ticket := null;
    return NEW;
  end if;

  if v_uid is null or v_uid <> v_parts[2] then
    raise exception 'POST_TICKET_INVALID';
  end if;

  if v_parts[3] = 'exempt' then
    if not public.has_role(v_uid::uuid, 'admin') then
      raise exception 'POST_TICKET_INVALID';
    end if;
    NEW.post_charge_id := null;
  elsif v_parts[3] in ('free', 'paid') then
    if NEW.user_id::text <> v_parts[2] then
      raise exception 'POST_TICKET_INVALID';
    end if;
    v_charge := v_parts[1]::uuid;
    insert into private.used_post_charges(charge_id, post_id) values (v_charge, NEW.id)
    on conflict (charge_id) do nothing;
    if not found then
      raise exception 'POST_TICKET_USED';
    end if;
    NEW.post_charge_id := v_charge;
  else
    raise exception 'POST_TICKET_INVALID';
  end if;
  NEW.post_ticket := null;
  return NEW;
end; $$;
commit;
