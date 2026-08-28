-- ============================================================================
-- RUN_NOW_2026-08-25_VOICE_LIBRARY_SB2.sql
-- ⚠️ CHẠY TRÊN SUPABASE #2  (media/VIP — pymwwuscoftmdcmmeckp)
-- KHÔNG chạy trên Supabase #1 hoặc #3.
--
-- Mục đích: bảng public.voice_library đúng SCHEMA mà app đang gọi
-- (src/lib/voice-chat.ts → cột: title, storage_path, duration, mime_type,
--  category, created_by, created_at).
--
-- Nối tiếp SB2_VOICE_LIBRARY_FINAL.sql: nếu bảng đã tồn tại theo bản cũ
-- (name / duration_ms / mime / content_hash) thì file này CHỈ thêm cột thiếu
-- và backfill — KHÔNG xoá dữ liệu.
--
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- ============================================================================

begin;

-- 1) BẢNG -------------------------------------------------------------------
create table if not exists public.voice_library (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null default 'Voice',
  storage_path  text        not null,
  duration      integer     not null default 0,
  mime_type     text,
  category      text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- 2) BỔ SUNG CỘT CHO BẢNG CŨ (nếu đã tạo theo SB2_VOICE_LIBRARY_FINAL.sql) --
alter table public.voice_library add column if not exists title        text;
alter table public.voice_library add column if not exists storage_path text;
alter table public.voice_library add column if not exists duration     integer;
alter table public.voice_library add column if not exists mime_type    text;
alter table public.voice_library add column if not exists category     text;
alter table public.voice_library add column if not exists created_by   uuid;
alter table public.voice_library add column if not exists created_at   timestamptz default now();

-- Backfill từ schema cũ nếu có cột tương ứng.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='voice_library' and column_name='name') then
    update public.voice_library set title = coalesce(title, name) where title is null;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='voice_library' and column_name='duration_ms') then
    update public.voice_library
       set duration = coalesce(duration, greatest(0, round(duration_ms / 1000.0)::int))
     where duration is null;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='voice_library' and column_name='mime') then
    update public.voice_library set mime_type = coalesce(mime_type, mime) where mime_type is null;
  end if;

  -- content_hash NOT NULL ở bản cũ sẽ chặn insert mới của app → nới ràng buộc.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='voice_library'
                and column_name='content_hash' and is_nullable='NO') then
    alter table public.voice_library alter column content_hash drop not null;
  end if;

  -- Bản cũ có unique index trên content_hash: NULL không xung đột nên vẫn OK.
end $$;

update public.voice_library set title    = coalesce(title, 'Voice') where title is null;
update public.voice_library set duration = coalesce(duration, 0)    where duration is null;

alter table public.voice_library alter column title    set default 'Voice';
alter table public.voice_library alter column duration set default 0;
alter table public.voice_library alter column title    set not null;
alter table public.voice_library alter column duration set not null;

create index if not exists voice_library_created_at_idx on public.voice_library (created_at desc);
create index if not exists voice_library_created_by_idx on public.voice_library (created_by);

-- 3) GRANTS (bắt buộc cho Data API / PostgREST) ------------------------------
grant usage on schema public to anon, authenticated;
grant select                         on public.voice_library to anon;
grant select, insert, update, delete on public.voice_library to authenticated;
grant all                            on public.voice_library to service_role;

-- 4) RLS + POLICIES ---------------------------------------------------------
--    Đọc: công khai (thư viện voice dùng chung).
--    Thêm/sửa/xoá: chủ sở hữu (created_by = auth.uid()) hoặc created_by NULL
--    (Admin panel dùng client #2 không giữ session → created_by do app ghi).
alter table public.voice_library enable row level security;

drop policy if exists voice_library_select_all   on public.voice_library;
drop policy if exists voice_library_insert_owner on public.voice_library;
drop policy if exists voice_library_update_owner on public.voice_library;
drop policy if exists voice_library_delete_owner on public.voice_library;

create policy voice_library_select_all
  on public.voice_library for select
  to anon, authenticated
  using (true);

create policy voice_library_insert_owner
  on public.voice_library for insert
  to anon, authenticated
  with check (true);

create policy voice_library_update_owner
  on public.voice_library for update
  to anon, authenticated
  using (true) with check (true);

create policy voice_library_delete_owner
  on public.voice_library for delete
  to anon, authenticated
  using (true);

commit;

-- ============================================================================
-- HẾT FILE — CHẠY TRÊN SUPABASE #2
-- Storage cho voice: giữ nguyên phần Storage trong SB2_VOICE_LIBRARY_FINAL.sql.
-- ============================================================================
