-- =====================================================================
-- FIX: column "gift_key" of relation "post_gifts" does not exist  (SB1)
-- Project SB1: gxfxqbhxoghdhokwjpex
--
-- Schema THỰC TẾ hiện tại của public.post_gifts (đã kiểm tra qua PostgREST):
--   id, post_id, sender_id, receiver_id, amount, claimed, claimed_at, created_at
--   -> THIẾU DUY NHẤT: gift_key
--   (không có: from_user_id, status, currency, gift_type, note, effect,
--    gift_name, emoji, updated_at)
--
-- Migration idempotent — KHÔNG drop bảng, KHÔNG xoá dữ liệu, KHÔNG tạo bảng
-- mới, KHÔNG đụng tới logic Gem / pending / claim.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'post_gifts'
  ) then
    raise exception 'public.post_gifts không tồn tại — dừng lại, không tự tạo bảng mới.';
  end if;
end $$;

alter table public.post_gifts add column if not exists gift_key    text;
alter table public.post_gifts add column if not exists receiver_id uuid;
alter table public.post_gifts add column if not exists claimed     boolean not null default false;
alter table public.post_gifts add column if not exists claimed_at  timestamptz;

-- Quà cũ chưa có gift_key -> gán mặc định để UI không vỡ.
update public.post_gifts set gift_key = 'gift' where gift_key is null;

-- Index phục vụ claim / đếm quà pending của người nhận.
create index if not exists post_gifts_receiver_claimed_idx
  on public.post_gifts (receiver_id, claimed);

-- Kiểm tra lại kết quả
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'post_gifts'
order by ordinal_position;
