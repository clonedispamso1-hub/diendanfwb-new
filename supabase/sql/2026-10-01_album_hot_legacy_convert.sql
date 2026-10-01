-- ALBUM HOT: chuyển Code HOT cũ (flash_hot_codes) thành Album. Idempotent, không xóa dữ liệu gốc.
-- Chạy lại nhiều lần không tạo Album trùng.

-- 1) Code duy nhất (chặn trùng khi chạy song song). Bỏ qua nếu đã có.
create unique index if not exists flash_albums_code_uidx on public.flash_albums (upper(code));

-- 2) Tạo Album cho mỗi Code cũ chưa có, giữ nguyên Code.
insert into public.flash_albums (code, name, created_at)
select upper(trim(h.code)), coalesce(nullif(h.title, ''), upper(trim(h.code))), h.created_at
from public.flash_hot_codes h
where coalesce(trim(h.code), '') <> ''
  and not exists (select 1 from public.flash_albums a where upper(a.code) = upper(trim(h.code)));

-- 3) Thêm ảnh/video (URL nguyên vẹn) cho Album chưa có media nào.
with src as (
  select a.id as album_id, h.created_at,
         (substr(h.content, length('__hot_media__:') + 1))::jsonb as m
  from public.flash_hot_codes h
  join public.flash_albums a on upper(a.code) = upper(trim(h.code))
  where h.content like '__hot_media__:%'
    and not exists (select 1 from public.flash_album_media x where x.album_id = a.id)
)
insert into public.flash_album_media (album_id, kind, url, storage_path, size_bytes, display_order, created_at)
select album_id, 'image', m->>'image_url', null, 0, 0, created_at from src where coalesce(m->>'image_url', '') <> ''
union all
select album_id, 'video', m->>'video_url', null, 0, 1, created_at from src where coalesce(m->>'video_url', '') <> '';
