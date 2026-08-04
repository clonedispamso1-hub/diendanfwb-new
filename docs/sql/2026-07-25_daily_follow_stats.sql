-- =====================================================================
-- daily_follow_stats — bảng lưu số follow MỚI mỗi ngày (per user)
-- Reset tự động lúc 00:00 mỗi ngày vì key gồm (day, user_id): ngày mới
-- tự có row mới, ngày cũ giữ nguyên làm lịch sử.
--
-- Leaderboard "Người theo dõi hôm nay" đã lấy dữ liệu này thông qua RPC
-- public.leaderboard_follow('today'); tệp này cho phép truy vấn trực tiếp
-- bảng khi cần và bảo đảm dữ liệu không dựa trên tổng followers_count.
-- Chạy trong Supabase SQL Editor (an toàn khi chạy lại).
-- =====================================================================

create table if not exists public.daily_follow_stats (
  day date not null default current_date,
  user_id uuid not null references auth.users(id) on delete cascade,
  new_followers integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);

create index if not exists daily_follow_stats_day_score_idx
  on public.daily_follow_stats (day, new_followers desc);

grant select on public.daily_follow_stats to anon, authenticated;
grant all on public.daily_follow_stats to service_role;

alter table public.daily_follow_stats enable row level security;

drop policy if exists "daily_follow_stats readable" on public.daily_follow_stats;
create policy "daily_follow_stats readable"
  on public.daily_follow_stats
  for select
  to anon, authenticated
  using (true);

-- Trigger: mỗi follow mới → +1 cho người ĐƯỢC follow trong ngày hôm nay.
-- Khi unfollow trong cùng ngày → -1 (không âm).
do $$ begin
  if to_regclass('public.follows') is not null then
    execute $f$
      create or replace function public.tg_daily_follow_ins()
      returns trigger language plpgsql security definer set search_path = public as $body$
      begin
        if new.following_id is null or new.following_id = new.follower_id then
          return new;
        end if;
        insert into public.daily_follow_stats(day, user_id, new_followers)
        values (current_date, new.following_id, 1)
        on conflict (day, user_id) do update
          set new_followers = public.daily_follow_stats.new_followers + 1,
              updated_at = now();
        return new;
      end;
      $body$;
    $f$;
    drop trigger if exists trg_daily_follow_ins on public.follows;
    create trigger trg_daily_follow_ins
      after insert on public.follows
      for each row execute function public.tg_daily_follow_ins();

    execute $f$
      create or replace function public.tg_daily_follow_del()
      returns trigger language plpgsql security definer set search_path = public as $body$
      begin
        if old.following_id is null then return old; end if;
        if coalesce(old.created_at, now())::date = current_date then
          update public.daily_follow_stats
             set new_followers = greatest(0, new_followers - 1),
                 updated_at = now()
           where day = current_date and user_id = old.following_id;
        end if;
        return old;
      end;
      $body$;
    $f$;
    drop trigger if exists trg_daily_follow_del on public.follows;
    create trigger trg_daily_follow_del
      after delete on public.follows
      for each row execute function public.tg_daily_follow_del();
  end if;
end $$;

-- Dọn dữ liệu > 60 ngày nếu có pg_cron.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'daily_follow_stats_prune',
      '10 0 * * *',
      $$delete from public.daily_follow_stats where day < current_date - interval '60 days';$$
    );
  end if;
end $$;
