-- ============================================================
-- Tym mô phỏng — tách cấu hình ra bảng riêng theo post_id
-- CHẠY THỦ CÔNG trên Supabase #1 (cùng DB với admin_site_settings).
-- Idempotent: chạy lại an toàn. KHÔNG đụng bảng likes, KHÔNG cron,
-- KHÔNG realtime, KHÔNG xoá cấu hình cũ (sim_likes_config giữ làm fallback).
-- Yêu cầu: hàm public.is_admin(uuid) đã có (RUN_NOW_2026-08-13_site_settings_rpc_fix.sql).
-- ============================================================

-- 1) Bảng ------------------------------------------------------
create table if not exists public.simulated_post_likes (
  post_id          uuid primary key,                 -- id bài trên Supabase #3
  author_id        uuid not null,                    -- tài khoản thứ hai đăng bài
  target           integer not null check (target in (1000, 2000, 3000, 4000, 5000)),
  duration_minutes integer not null check (duration_minutes in (60, 180, 1440)),
  started_at       timestamptz not null default now(),
  ends_at          timestamptz not null,
  final_count      integer check (final_count is null or (final_count between 0 and 5000)),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > started_at)
);

-- Dọn "đã chạy xong nhưng chưa chốt" nhanh, không quét cả bảng.
create index if not exists simulated_post_likes_pending_idx
  on public.simulated_post_likes (ends_at) where final_count is null;

-- 2) Quyền -----------------------------------------------------
grant select on public.simulated_post_likes to anon, authenticated;
grant insert, update, delete on public.simulated_post_likes to authenticated;
grant all on public.simulated_post_likes to service_role;

-- 3) RLS -------------------------------------------------------
alter table public.simulated_post_likes enable row level security;

drop policy if exists spl_read on public.simulated_post_likes;
create policy spl_read on public.simulated_post_likes
  for select to anon, authenticated using (true);

drop policy if exists spl_admin_insert on public.simulated_post_likes;
create policy spl_admin_insert on public.simulated_post_likes
  for insert to authenticated with check (public.is_admin(auth.uid()));

drop policy if exists spl_admin_update on public.simulated_post_likes;
create policy spl_admin_update on public.simulated_post_likes
  for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists spl_admin_delete on public.simulated_post_likes;
create policy spl_admin_delete on public.simulated_post_likes
  for delete to authenticated using (public.is_admin(auth.uid()));

-- updated_at tự cập nhật (chỉ chạy khi Admin ghi)
drop trigger if exists simulated_post_likes_touch on public.simulated_post_likes;
create trigger simulated_post_likes_touch before update on public.simulated_post_likes
  for each row execute function public.tg_touch_updated_at();

-- 4) Chuyển dữ liệu cũ từ admin_site_settings.sim_likes_config ---
--    Đang chạy: { a, t, m, s(ms) }   Đã chốt: { a, f }
--    Bỏ qua cấu hình lỗi; không ghi đè dòng đã có.
insert into public.simulated_post_likes
  (post_id, author_id, target, duration_minutes, started_at, ends_at, final_count)
select
  e.key::uuid,
  (e.value->>'a')::uuid,
  coalesce((e.value->>'t')::int, (e.value->>'f')::int),
  coalesce((e.value->>'m')::int, 60),
  coalesce(to_timestamp((e.value->>'s')::bigint / 1000.0), now() - interval '2 days'),
  coalesce(to_timestamp((e.value->>'s')::bigint / 1000.0), now() - interval '2 days')
    + make_interval(mins => coalesce((e.value->>'m')::int, 60)),
  (e.value->>'f')::int
from public.admin_site_settings s,
     lateral jsonb_each(s.value::jsonb) e
where s.key = 'sim_likes_config'
  and e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (e.value->>'a') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and coalesce((e.value->>'t')::int, (e.value->>'f')::int) in (1000, 2000, 3000, 4000, 5000)
  and coalesce((e.value->>'m')::int, 60) in (60, 180, 1440)
on conflict (post_id) do nothing;

-- 5) Kiểm tra sau khi chạy ---------------------------------------
-- select count(*) as tong, count(final_count) as da_chot from public.simulated_post_likes;
-- Kiểm tra user thường bị chặn (chạy với 1 user KHÔNG phải admin):
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid-user-thuong>","role":"authenticated"}';
--   insert into public.simulated_post_likes (post_id, author_id, target, duration_minutes, ends_at)
--   values (gen_random_uuid(), '<uuid-user-thuong>', 1000, 60, now() + interval '1 hour');
--   → phải báo lỗi "new row violates row-level security policy".
