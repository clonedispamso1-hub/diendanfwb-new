-- =====================================================================
-- CHẠY TRÊN SUPABASE 3 (bảng posts), NGAY SAU file SB1 cùng ngày.
-- Thay DAN_KHOA_TU_SUPABASE_1 bằng chuỗi mà file SB1 in ra ở bước cuối.
-- Mọi bài MỚI phải kèm vé hợp lệ do Supabase 1 ký; mỗi vé dùng 1 lần.
-- Không sửa / xoá bài cũ (cột mới để trống cho bài cũ).
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.post_ticket_secret (
  id boolean primary key default true check (id),
  secret text not null
);
insert into private.post_ticket_secret(id, secret)
values (true, 'DAN_KHOA_TU_SUPABASE_1')
on conflict (id) do update set secret = excluded.secret;

alter table public.posts add column if not exists post_ticket text;
alter table public.posts add column if not exists post_charge_id uuid;
create unique index if not exists posts_post_charge_id_key
  on public.posts(post_charge_id) where post_charge_id is not null;

create or replace function private.enforce_post_ticket()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_parts text[];
  v_msg text;
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
begin
  -- Hệ thống nội bộ (service role, hàm SQL, bot) giữ nguyên hành vi.
  if v_role = 'service_role' or v_role = '' then
    NEW.post_ticket := null;
    return NEW;
  end if;
  -- Bài góp ý không tính lượt.
  if NEW.category::text = 'feedback' or NEW.visibility::text = 'feedback' then
    NEW.post_ticket := null;
    return NEW;
  end if;

  if NEW.post_ticket is null then
    raise exception 'POST_TICKET_REQUIRED: Bài đăng cần lượt miễn phí hoặc thanh toán.';
  end if;
  v_parts := string_to_array(NEW.post_ticket, '.');
  if array_length(v_parts, 1) <> 5 then
    raise exception 'POST_TICKET_INVALID';
  end if;
  select secret into v_secret from private.post_ticket_secret where id;
  v_msg := v_parts[1] || '.' || v_parts[2] || '.' || v_parts[3] || '.' || v_parts[4];
  if encode(extensions.hmac(v_msg, v_secret, 'sha256'), 'hex') <> v_parts[5] then
    raise exception 'POST_TICKET_INVALID';
  end if;
  if v_parts[4]::bigint < floor(extract(epoch from now()))::bigint then
    raise exception 'POST_TICKET_EXPIRED: Vui lòng đăng lại.';
  end if;

  if v_parts[3] <> 'exempt' then
    if NEW.user_id::text <> v_parts[2] then
      raise exception 'POST_TICKET_INVALID';
    end if;
    if exists (select 1 from public.posts where post_charge_id = v_parts[1]::uuid) then
      raise exception 'POST_TICKET_USED';
    end if;
    NEW.post_charge_id := v_parts[1]::uuid;
  end if;
  NEW.post_ticket := null;
  return NEW;
end; $$;

drop trigger if exists trg_enforce_post_ticket on public.posts;
create trigger trg_enforce_post_ticket
  before insert on public.posts
  for each row execute function private.enforce_post_ticket();

-- Không cho sửa cột vé sau khi tạo bài.
create or replace function private.lock_post_charge_id()
returns trigger language plpgsql as $$
begin
  NEW.post_charge_id := OLD.post_charge_id;
  NEW.post_ticket := null;
  return NEW;
end; $$;
drop trigger if exists trg_lock_post_charge_id on public.posts;
create trigger trg_lock_post_charge_id
  before update on public.posts
  for each row execute function private.lock_post_charge_id();
