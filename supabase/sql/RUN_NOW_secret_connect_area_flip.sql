-- ❤️ Kết Nối Bí Mật — bổ sung cấu hình hiển thị khu vực + hiệu ứng lật thông tin.
alter table if exists public.secret_connect_settings
  add column if not exists show_area_before boolean not null default true,
  add column if not exists show_real_area_after boolean not null default true,
  add column if not exists show_district boolean not null default true,
  add column if not exists flip_enabled boolean not null default true,
  add column if not exists flip_ms integer not null default 2000;

-- connect_area tự đồng bộ từ hồ sơ (region/province) khi người dùng mở trang.
alter table if exists public.profiles
  add column if not exists connect_area text;
