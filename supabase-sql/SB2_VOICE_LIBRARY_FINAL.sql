-- ============================================================================
-- SB2_VOICE_LIBRARY_FINAL.sql
-- ⚠️ CHẠY TRÊN SUPABASE #2  (media/VIP — pymwwuscoftmdcmmeckp)
-- KHÔNG chạy file này trên Supabase #1 hoặc #3.
--
-- Mục đích: thư viện voice dùng chung (dedupe theo content_hash).
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) BẢNG public.voice_library
-- ---------------------------------------------------------------------------
create table if not exists public.voice_library (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  storage_path  text        not null,
  public_url    text,
  mime          text        not null default 'audio/webm',
  size_bytes    bigint      not null default 0,
  duration_ms   integer     not null default 0,
  content_hash  text        not null,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- Cùng một voice (cùng nội dung) chỉ lưu 1 lần
create unique index if not exists voice_library_content_hash_key
  on public.voice_library (content_hash);

create unique index if not exists voice_library_storage_path_key
  on public.voice_library (storage_path);

create index if not exists voice_library_created_at_idx
  on public.voice_library (created_at desc);

create index if not exists voice_library_created_by_idx
  on public.voice_library (created_by);

-- ---------------------------------------------------------------------------
-- 2) GRANTS (bắt buộc cho Data API / PostgREST)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select                         on public.voice_library to anon;
grant select, insert, update, delete on public.voice_library to authenticated;
grant all                            on public.voice_library to service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS + POLICIES
--    Đọc: công khai (thư viện voice dùng chung).
--    Thêm/sửa/xoá: chỉ chủ sở hữu (created_by = auth.uid()).
-- ---------------------------------------------------------------------------
alter table public.voice_library enable row level security;

drop policy if exists voice_library_select_all      on public.voice_library;
drop policy if exists voice_library_insert_owner    on public.voice_library;
drop policy if exists voice_library_update_owner    on public.voice_library;
drop policy if exists voice_library_delete_owner    on public.voice_library;

create policy voice_library_select_all
  on public.voice_library
  for select
  to anon, authenticated
  using (true);

create policy voice_library_insert_owner
  on public.voice_library
  for insert
  to authenticated
  with check (created_by is null or created_by = auth.uid());

create policy voice_library_update_owner
  on public.voice_library
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy voice_library_delete_owner
  on public.voice_library
  for delete
  to authenticated
  using (created_by = auth.uid());

commit;

-- ============================================================================
-- 4) STORAGE — bucket "media", prefix "voice/"
--    Chỉ cho phép truy cập object trong prefix voice/.
--    KHÔNG cho client list toàn bộ bucket (không có policy nào cho phép
--    select object ngoài prefix voice/ ⇒ list bucket root trả về rỗng).
--
--    Nếu bucket "media" chưa tồn tại: tạo bằng Dashboard → Storage
--    (Public bucket = ON nếu muốn public_url đọc trực tiếp).
-- ============================================================================

drop policy if exists voice_prefix_read           on storage.objects;
drop policy if exists voice_prefix_insert_auth    on storage.objects;
drop policy if exists voice_prefix_update_owner   on storage.objects;
drop policy if exists voice_prefix_delete_owner   on storage.objects;

-- Đọc / tải file trong voice/ (bao gồm list CHỈ trong prefix voice/)
create policy voice_prefix_read
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'voice'
  );

-- Upload vào voice/ : chỉ user đã đăng nhập
create policy voice_prefix_insert_auth
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'voice'
  );

-- Sửa / xoá: chỉ người upload
create policy voice_prefix_update_owner
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'voice'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'voice'
  );

create policy voice_prefix_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'voice'
    and owner = auth.uid()
  );

-- ============================================================================
-- HẾT FILE — CHẠY TRÊN SUPABASE #2
-- ============================================================================
