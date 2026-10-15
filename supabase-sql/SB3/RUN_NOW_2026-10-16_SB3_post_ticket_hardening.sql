-- =====================================================================
-- CHẠY TRÊN SUPABASE 3, SAU file RUN_NOW_2026-10-15_post_ticket_guard.sql.
-- An toàn chạy lại. KHÔNG xoá/sửa bài cũ, KHÔNG đụng khoá ký (đổi khoá: xem file ROTATE_*).
--
-- 1) Request thiếu role trong JWT KHÔNG còn được bỏ qua kiểm tra vé.
--    Chỉ bỏ qua khi: JWT role = service_role, HOẶC kết nối trực tiếp của chủ
--    database (postgres / supabase_admin: SQL Editor, pg_cron) — không đi qua API.
-- 2) Vé thường phải khớp cả user_id của bài lẫn người đang đăng nhập.
--    Vé miễn trừ chỉ dùng được bởi chính Admin đã nhận vé.
-- 3) Sổ "lượt đã dùng" riêng: xoá bài cũng không làm lượt dùng lại được;
--    hai request song song cùng vé → chỉ 1 bài được tạo.
-- 4) Không cho đổi bài góp ý (miễn phí) thành bài thường để né phí.
-- 5) Chỉ chủ bài hoặc Admin được sửa / xoá bài (policy RESTRICTIVE, giữ nguyên
--    các policy hiện có, chỉ chặn thêm).
-- =====================================================================

create table if not exists private.used_post_charges (
  charge_id uuid primary key,
  post_id uuid,
  used_at timestamptz not null default now()
);
revoke all on private.used_post_charges from public, anon, authenticated;

-- Ghi lại các lượt đã dùng bởi bài hiện có (chỉ đọc bảng posts, không sửa).
insert into private.used_post_charges(charge_id, post_id)
select post_charge_id, id from public.posts where post_charge_id is not null
on conflict (charge_id) do nothing;

create or replace function private.post_ticket_trusted_caller()
returns boolean language plpgsql stable as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role text;
begin
  v_role := coalesce(v_claims::jsonb->>'role', nullif(current_setting('request.jwt.claim.role', true), ''));
  if v_role = 'service_role' then
    return true;
  end if;
  -- Không có JWT: chỉ tin kết nối trực tiếp của chủ DB (không qua PostgREST).
  if v_role is null and session_user in ('postgres', 'supabase_admin') then
    return true;
  end if;
  return false;
end; $$;
revoke all on function private.post_ticket_trusted_caller() from public, anon, authenticated;

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

drop trigger if exists trg_enforce_post_ticket on public.posts;
create trigger trg_enforce_post_ticket
  before insert on public.posts
  for each row execute function private.enforce_post_ticket();

create or replace function private.lock_post_charge_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  NEW.post_charge_id := OLD.post_charge_id;
  NEW.post_ticket := null;
  if not private.post_ticket_trusted_caller()
     and (OLD.category::text = 'feedback' or OLD.visibility::text = 'feedback')
     and not (NEW.category::text = 'feedback' or NEW.visibility::text = 'feedback') then
    raise exception 'FEEDBACK_POST_LOCKED: Không thể chuyển bài góp ý thành bài thường.';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_lock_post_charge_id on public.posts;
create trigger trg_lock_post_charge_id
  before update on public.posts
  for each row execute function private.lock_post_charge_id();

-- 5) Chỉ chủ bài / Admin được sửa, xoá ------------------------------------
drop policy if exists posts_owner_or_admin_update_guard on public.posts;
create policy posts_owner_or_admin_update_guard on public.posts
  as restrictive for update to anon, authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists posts_owner_or_admin_delete_guard on public.posts;
create policy posts_owner_or_admin_delete_guard on public.posts
  as restrictive for delete to anon, authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Policy cho phép (permissive) để chủ bài / Admin thực sự sửa, xoá được.
drop policy if exists posts_owner_or_admin_update on public.posts;
create policy posts_owner_or_admin_update on public.posts
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists posts_owner_or_admin_delete on public.posts;
create policy posts_owner_or_admin_delete on public.posts
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Kiểm tra nhanh (chỉ đọc): danh sách policy hiện có trên posts.
select policyname, permissive, cmd, roles from pg_policies
 where schemaname = 'public' and tablename = 'posts' order by cmd, policyname;
