-- Floating Bubbles (Nhóm Zalo + Fanpage) — chỉ seed default cho key mới,
-- dùng chung bảng admin_site_settings + RPC admin_set_site_setting / get_site_setting.
insert into public.admin_site_settings(key, value)
values ('floating_bubbles', jsonb_build_object(
  'enabled', true,
  'zalo',    jsonb_build_object('enabled', true, 'title', 'Nhóm Zalo',    'url', 'https://zalo.me/', 'icon', '📱'),
  'facebook',jsonb_build_object('enabled', true, 'title', 'Fanpage Admin','url', 'https://facebook.com/', 'icon', '👍')
))
on conflict (key) do nothing;
