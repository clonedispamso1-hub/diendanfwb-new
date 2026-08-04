-- ============================================================
-- SUPABASE #2 (DB phụ) — chạy trong SQL editor của project MEDIA.
-- Tạo: site_settings2 (cấu hình popup bắt buộc) + user_zalo (số Zalo).
-- Idempotent. KHÔNG đụng tới Supabase #1.
-- ============================================================

-- 1) Cấu hình site (key/value) --------------------------------
create table if not exists public.site_settings2 (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.site_settings2 to anon, authenticated;
grant insert, update, delete on public.site_settings2 to anon, authenticated;
grant all on public.site_settings2 to service_role;

alter table public.site_settings2 enable row level security;

drop policy if exists site_settings2_read  on public.site_settings2;
drop policy if exists site_settings2_write on public.site_settings2;

create policy site_settings2_read
  on public.site_settings2 for select to anon, authenticated using (true);

create policy site_settings2_write
  on public.site_settings2 for all to anon, authenticated
  using (true) with check (true);

insert into public.site_settings2(key, value)
values ('required_popup', jsonb_build_object(
  'enabled', false,
  'title', 'Thông báo',
  'content', E'Để tiếp tục sử dụng Website\n\nBạn cần:\n✔ Xác nhận đã đủ 18 tuổi\n✔ Kết bạn Facebook Admin\n✔ Theo dõi Fanpage\n\nSau khi hoàn thành hãy bấm Tiếp tục.',
  'facebook_url', '',
  'fanpage_url', '',
  'hide_hours', 2
))
on conflict (key) do nothing;

-- 2) Số Zalo của thành viên (KHÔNG lưu ở DB chính) -------------
create table if not exists public.user_zalo (
  user_id    uuid primary key,
  phone      text,
  skipped    boolean not null default false,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.user_zalo to anon, authenticated;
grant all on public.user_zalo to service_role;

alter table public.user_zalo enable row level security;

drop policy if exists user_zalo_read  on public.user_zalo;
drop policy if exists user_zalo_write on public.user_zalo;

create policy user_zalo_read
  on public.user_zalo for select to anon, authenticated using (true);

create policy user_zalo_write
  on public.user_zalo for all to anon, authenticated
  using (true) with check (true);
