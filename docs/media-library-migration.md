# Cập nhật DB cũ cho Trung tâm Media

Chạy đoạn SQL sau **một lần** trong Supabase SQL Editor của project cũ
(`zbuwddjcqdlyijcunwgd`) để bật thư mục + phân quyền cho kho GIF/Sticker/Icon:

```sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_access_level') then
    create type public.media_access_level as enum ('public', 'vip', 'admin');
  end if;
end $$;

alter table public.gif_library
  add column if not exists folder_name text,
  add column if not exists access_level public.media_access_level not null default 'public';

create index if not exists gif_library_access_level_idx on public.gif_library (access_level);
create index if not exists gif_library_folder_idx on public.gif_library (folder_name);
```

Trước khi chạy SQL, code vẫn hoạt động bình thường (tự lùi về schema cũ:
mọi item được coi là `public`, không có thư mục).
