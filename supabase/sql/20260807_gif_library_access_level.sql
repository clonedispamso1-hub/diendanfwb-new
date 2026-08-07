-- Kho GIF / Sticker / Icon dùng chung: thêm phân quyền + thư mục.
-- Chạy trong Supabase SQL Editor của DB đang dùng (giữ nguyên dữ liệu cũ).

-- 1) Cột mới -----------------------------------------------------------------
alter table public.gif_library
  add column if not exists folder_name text,
  add column if not exists access_level text not null default 'public',
  add column if not exists sort_order int;

-- 2) Ràng buộc giá trị hợp lệ -------------------------------------------------
update public.gif_library
   set access_level = 'public'
 where access_level is null
    or access_level not in ('public', 'vip', 'admin');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gif_library_access_level_check'
  ) then
    alter table public.gif_library
      add constraint gif_library_access_level_check
      check (access_level in ('public', 'vip', 'admin'));
  end if;
end$$;

-- 3) Index cho truy vấn của khung chọn GIF ------------------------------------
create index if not exists gif_library_access_level_idx
  on public.gif_library (access_level);
create index if not exists gif_library_kind_access_idx
  on public.gif_library (kind, access_level, created_at desc);
create index if not exists gif_library_folder_idx
  on public.gif_library (folder_name);

-- 4) Quyền đọc ----------------------------------------------------------------
grant select on public.gif_library to anon, authenticated;
grant all on public.gif_library to service_role;
