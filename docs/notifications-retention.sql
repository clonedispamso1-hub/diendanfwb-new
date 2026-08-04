-- ============================================================
-- Notification retention: tự động xoá thông báo quá 7 ngày
-- Chạy 1 lần trong Supabase SQL Editor của DB hiện tại.
-- Không ảnh hưởng bất kỳ bảng nào khác.
-- ============================================================

-- 1) Index cho truy vấn/dọn dẹp theo thời gian (rất quan trọng khi bảng lớn)
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- 2) Hàm dọn dẹp
create or replace function public.purge_old_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.notifications
  where created_at < now() - interval '7 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.purge_old_notifications() from public, anon, authenticated;

-- 3) Cron mỗi ngày 03:15 UTC (cần extension pg_cron)
create extension if not exists pg_cron;

select cron.unschedule('purge-old-notifications')
where exists (select 1 from cron.job where jobname = 'purge-old-notifications');

select cron.schedule(
  'purge-old-notifications',
  '15 3 * * *',
  $$select public.purge_old_notifications();$$
);
