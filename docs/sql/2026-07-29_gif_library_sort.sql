-- Sort order for GIF library, cho phép Admin sắp xếp thứ tự hiển thị.
alter table public.gif_library add column if not exists sort_order int default 0;
create index if not exists gif_library_kind_sort_idx
  on public.gif_library (kind, sort_order asc, created_at desc);
