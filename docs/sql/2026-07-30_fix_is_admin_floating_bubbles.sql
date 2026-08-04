-- ============================================================
-- FIX: "FORBIDDEN: user ... is not an approved active admin"
-- khi Admin lưu Bong bóng nổi (Fanpage / Nhóm Zalo).
--
-- Nguyên nhân: public.is_admin() chỉ kiểm tra bảng `bangchu`,
-- trong khi app đăng nhập admin bằng cờ profiles.is_admin.
-- => Admin hợp lệ vẫn bị chặn.
--
-- Idempotent. RLS giữ nguyên ENABLED.
-- Chạy trong Supabase SQL editor (project zbuwddjcqdlyijcunwgd).
-- ============================================================

create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1) Admin theo bảng bangchu (approved + active)
    exists (
      select 1 from public.bangchu b
      where b.auth_user_id = _uid
        and b.status = 'approved'
        and b.is_active = true
    )
    or
    -- 2) Admin theo cờ profiles.is_admin (cách app đang dùng)
    exists (
      select 1 from public.profiles p
      where p.id = _uid
        and p.is_admin = true
    ),
  false);
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

-- Đảm bảo RPC ghi setting vẫn cấp quyền đúng cho admin
grant execute on function public.admin_set_site_setting(text, jsonb) to authenticated;
grant execute on function public.get_site_setting(text) to anon, authenticated;

-- Seed key floating_bubbles (thêm màu) nếu chưa có
insert into public.admin_site_settings(key, value)
values ('floating_bubbles', jsonb_build_object(
  'enabled', true,
  'zalo',     jsonb_build_object('enabled', true, 'title', 'Nhóm Zalo',     'url', 'https://zalo.me/', 'icon', '📱', 'color', '#0068ff'),
  'facebook', jsonb_build_object('enabled', true, 'title', 'Fanpage Admin', 'url', 'https://facebook.com/', 'icon', '👍', 'color', '#1877f2')
))
on conflict (key) do nothing;
