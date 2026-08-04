-- Disable Maintenance Mode by default while keeping the entire maintenance
-- system intact. Run this once in the Supabase SQL editor for the existing
-- project (zbuwddjcqdlyijcunwgd) if maintenance is currently ON.
--
-- Safe to re-run: upserts the "maintenance" row in admin_site_settings with
-- enabled=false, preserving any other fields already stored.

insert into public.admin_site_settings (key, value)
values (
  'maintenance',
  jsonb_build_object(
    'enabled', false,
    'title', 'Bảo trì hệ thống',
    'message', 'Website đang được nâng cấp. Vui lòng quay lại sau ít phút.',
    'image_url', '',
    'font_size', 16
  )
)
on conflict (key) do update
set value = jsonb_set(
  coalesce(public.admin_site_settings.value, '{}'::jsonb),
  '{enabled}',
  'false'::jsonb,
  true
);
