-- =====================================================================
-- 🔐 Khoá cứng posts.facebook_url / posts.zalo_url ở tầng DATABASE (Supabase #3)
-- ---------------------------------------------------------------------
-- Mục tiêu: user thường dù gọi thẳng REST API với anon key và payload có
-- facebook_url / zalo_url cũng KHÔNG ghi được. Chỉ service role (server
-- function `attachPostContactLinks`, đã kiểm tra is_admin / role /
-- account_source trên Supabase #1) mới được ghi 2 cột này.
--
-- KHÔNG tạo bảng mới, KHÔNG đổi schema, KHÔNG đụng RLS/policy hiện có.
-- Chạy trên SQL Editor của Supabase #3 (uaqsetfdciyzxpuhulux).
-- =====================================================================

create or replace function public.guard_post_contact_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  -- service_role (server function) hoặc thao tác nội bộ (không có JWT) → cho qua.
  if jwt_role = 'service_role' or jwt_role = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.facebook_url is not null or new.zalo_url is not null then
      raise exception 'contact_links_forbidden'
        using hint = 'Chi Admin va tai khoan thu hai cua Admin moi duoc gan link Facebook/Zalo.';
    end if;
  else
    if new.facebook_url is distinct from old.facebook_url
       or new.zalo_url is distinct from old.zalo_url then
      raise exception 'contact_links_forbidden'
        using hint = 'Chi Admin va tai khoan thu hai cua Admin moi duoc gan link Facebook/Zalo.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_post_contact_links on public.posts;
create trigger trg_guard_post_contact_links
  before insert or update on public.posts
  for each row execute function public.guard_post_contact_links();
