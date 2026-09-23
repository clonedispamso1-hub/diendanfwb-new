-- Mục lớp 1 "VIP ZALO {LOCATION}" — thêm cấu hình "Số lượng khu vực hiển thị".
-- 0 = hiển thị tất cả khu vực; > 0 = chọn ngẫu nhiên số khu vực đó.
-- Idempotent: chạy lại nhiều lần không mất dữ liệu.

alter table public.zalo_sub_items_l1
  add column if not exists area_limit integer not null default 0;

alter table public.zalo_sub_items_l1
  drop constraint if exists zalo_sub_items_l1_area_limit_chk;
alter table public.zalo_sub_items_l1
  add constraint zalo_sub_items_l1_area_limit_chk check (area_limit >= 0);
