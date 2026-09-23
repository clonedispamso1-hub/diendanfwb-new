-- =====================================================================
-- ⚡ CHẠY TRÊN SUPABASE #2 (MEDIA) — project pymwwuscoftmdcmmeckp
--    KHÔNG chạy trên #1 (core) và KHÔNG chạy trên #3 (logs).
--
-- MỤC ĐÍCH
--   Lưu METADATA video (không lưu file). File video vẫn nằm trên
--   Cloudflare R2 — bảng này chỉ giữ URL R2 + thông tin người đăng để
--   Admin Panel → Quản lý bài viết → tab "Quản lý Video" đọc và hiển thị.
--
-- AN TOÀN: chỉ CREATE (idempotent). Không xoá / sửa dữ liệu sẵn có.
-- =====================================================================

create table if not exists public.video_posts (
  id            uuid primary key default gen_random_uuid(),
  -- UID bài viết dạng ABC-123 (3 chữ cái + '-' + 3 số), duy nhất.
  post_uid      text not null unique,
  -- Nguồn gốc bài: 'posts' (feed) hoặc 'videos_social'.
  source_table  text not null default 'posts',
  source_id     text not null,
  user_id       text not null,
  author_name   text,
  author_avatar text,
  content       text,
  video_url     text not null,
  created_at    timestamptz not null default now(),
  unique (source_table, source_id)
);

create index if not exists video_posts_created_at_idx on public.video_posts (created_at desc);
create index if not exists video_posts_user_idx       on public.video_posts (user_id);

-- Frontend nối #2 bằng anon key (Auth nằm ở #1) → phải cấp cho `anon`.
grant select, insert, update, delete on public.video_posts to anon, authenticated;
grant all on public.video_posts to service_role;

alter table public.video_posts enable row level security;

drop policy if exists "video_posts_read"   on public.video_posts;
drop policy if exists "video_posts_insert" on public.video_posts;
drop policy if exists "video_posts_update" on public.video_posts;
drop policy if exists "video_posts_delete" on public.video_posts;

create policy "video_posts_read"   on public.video_posts for select to anon, authenticated using (true);
create policy "video_posts_insert" on public.video_posts for insert to anon, authenticated with check (true);
create policy "video_posts_update" on public.video_posts for update to anon, authenticated using (true) with check (true);
create policy "video_posts_delete" on public.video_posts for delete to anon, authenticated using (true);

-- KIỂM TRA
select count(*) as rows_now from public.video_posts;
