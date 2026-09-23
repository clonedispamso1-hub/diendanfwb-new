-- Thêm số liệu thành viên + link tham gia cho MỤC LỚP 2 (zalo_sub_items_l2).
-- Không tạo bảng mới, không xoá dữ liệu. Idempotent — chạy lại an toàn.

alter table public.zalo_sub_items_l2
  add column if not exists member_count integer not null default 0,
  add column if not exists men_count    integer not null default 0,
  add column if not exists women_count  integer not null default 0,
  add column if not exists gold_key     integer not null default 0,
  add column if not exists silver_key   integer not null default 0,
  add column if not exists join_url     text    not null default '';
