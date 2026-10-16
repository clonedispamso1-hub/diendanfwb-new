-- =====================================================================
-- ĐỀ XUẤT — CHƯA CHẠY. CHẠY TRÊN SUPABASE 3 (uaqsetfdciyzxpuhulux).
-- Sửa lỗi POST_TICKET_INVALID cho vé "exempt" của Admin.
--
-- Nguyên nhân: nhánh exempt gọi public.has_role(v_uid,'admin') trên SB3,
-- nhưng SB3 không có dữ liệu vai trò (không có public.user_roles / profiles)
-- → luôn false. Quyền Admin đã được SB1 kiểm tra trước khi ký vé.
--
-- CHỈ đổi nhánh exempt:
--   - bỏ has_role (SB3 không có nguồn dữ liệu vai trò);
--   - THÊM chống dùng lại: ghi charge_id của vé vào private.used_post_charges
--     (khoá chính) → mỗi vé exempt dùng đúng 1 lần, kể cả 2 request đồng thời.
-- GIỮ NGUYÊN: trusted caller, feedback, thiếu vé, 5 phần, HMAC, thời hạn,
--   UID phiên = UID vé, nhánh internal / free / paid, khoá ký, trigger, RLS.
-- Thêm cho exempt: NEW.user_id phải = UID vé (trước đây exempt không kiểm tra).
-- =====================================================================

-- ---------- PHẦN A: KIỂM TRA CHỈ ĐỌC — chạy riêng và đọc kết quả trước ----------
-- A1. Định nghĩa trigger đang chạy (phải chứa 'internal' và has_role ở nhánh exempt).
select pg_get_functiondef('private.enforce_post_ticket()'::regprocedure);
-- A2. MỌI bản has_role (có thể nhiều hơn 1) và hàm trusted caller.
select p.oid::regprocedure as ham, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'public' and p.proname = 'has_role')
    or (n.nspname = 'private' and p.proname in ('post_ticket_trusted_caller', 'lock_post_charge_id'));
-- A3. Bảng sổ vé: charge_id phải là KHOÁ CHÍNH (uuid).
select a.attname, format_type(a.atttypid, a.atttypmod), i.indisprimary, i.indisunique
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'private.used_post_charges'::regclass;
-- A4. Trigger gắn trên posts (phải là BEFORE INSERT, đang bật).
select tgname, tgenabled, pg_get_triggerdef(oid) from pg_trigger
 where tgrelid = 'public.posts'::regclass and not tgisinternal;

-- ---------- PHẦN B: THAY ĐỔI — chỉ chạy sau khi Phần A đúng như mô tả ----------
begin;

do $$
declare v_def text := pg_get_functiondef('private.enforce_post_ticket()'::regprocedure);
begin
  if v_def !~ 'v_parts\[3\] = ''internal''' or v_def !~ 'has_role\(v_uid::uuid, ''admin''\)' then
    raise exception 'Trigger hiện tại KHÁC bản 2026-10-17 — dừng, không sửa gì.';
  end if;
  if not exists (select 1 from pg_index i join pg_attribute a
                   on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                  where i.indrelid = 'private.used_post_charges'::regclass
                    and i.indisprimary and a.attname = 'charge_id') then
    raise exception 'private.used_post_charges.charge_id không phải khoá chính — dừng.';
  end if;
end $$;

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

  -- Vé nội bộ cho Tài khoản thứ hai — GIỮ NGUYÊN.
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
    -- ĐỔI: SB1 đã xác minh Admin trước khi ký; SB3 không có dữ liệu vai trò.
    if NEW.user_id::text <> v_parts[2] then
      raise exception 'POST_TICKET_INVALID';
    end if;
    insert into private.used_post_charges(charge_id, post_id) values (v_parts[1]::uuid, NEW.id)
    on conflict (charge_id) do nothing;
    if not found then
      raise exception 'POST_TICKET_USED';
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
-- Trigger trg_enforce_post_ticket đã trỏ tới hàm này — không tạo lại trigger.
