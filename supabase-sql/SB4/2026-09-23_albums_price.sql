-- Supabase #4 — bổ sung 2 cột cho "Quản Lý Album": Giá (Xu) + Lượt mua ảo.
-- CHƯA CHẠY: chỉ chạy khi Admin đồng ý. Không đụng bảng/policy nào khác.

alter table public.albums
  add column if not exists price bigint not null default 0,
  add column if not exists fake_purchase_count bigint not null default 0;
