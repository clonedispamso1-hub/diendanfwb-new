-- =====================================================================
-- Daily leaderboard system (Top Follow / Top Bài viết ❤️ / Top Tương tác ⭐)
-- Reset at 00:00 mỗi ngày (server timezone).
-- Chạy trong SQL editor của Supabase.
-- =====================================================================

-- 1) Bảng lưu score theo ngày
create table if not exists public.leaderboard_daily (
  day date not null,
  kind text not null check (kind in ('follow','posts','tuongtac')),
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, kind, user_id)
);

create index if not exists leaderboard_daily_day_kind_score_idx
  on public.leaderboard_daily (day, kind, score desc);

-- Grants + RLS
grant select on public.leaderboard_daily to anon, authenticated;
grant all on public.leaderboard_daily to service_role;

alter table public.leaderboard_daily enable row level security;

drop policy if exists "leaderboard_daily readable" on public.leaderboard_daily;
create policy "leaderboard_daily readable"
  on public.leaderboard_daily
  for select
  to anon, authenticated
  using (true);

-- 2) Helper: cộng score
create or replace function public.lb_add(
  _kind text,
  _user_id uuid,
  _delta numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user_id is null or _delta = 0 then return; end if;
  insert into public.leaderboard_daily(day, kind, user_id, score)
  values (current_date, _kind, _user_id, _delta)
  on conflict (day, kind, user_id) do update
    set score = public.leaderboard_daily.score + excluded.score,
        updated_at = now();
end;
$$;

grant execute on function public.lb_add(text, uuid, numeric) to authenticated, service_role;

-- 3) Trigger: Top Follow — cộng khi có follow mới trong ngày
--    Giả định bảng follows(follower_id, following_id, created_at).
--    Nếu bảng tên khác, đổi tên bảng cho khớp.
do $$ begin
  if to_regclass('public.follows') is not null then
    execute $f$
      create or replace function public.tg_lb_follow_ins()
      returns trigger language plpgsql security definer set search_path = public as $body$
      begin
        perform public.lb_add('follow', new.following_id, 1);
        return new;
      end;
      $body$;
    $f$;
    drop trigger if exists trg_lb_follow_ins on public.follows;
    create trigger trg_lb_follow_ins
      after insert on public.follows
      for each row execute function public.tg_lb_follow_ins();

    execute $f$
      create or replace function public.tg_lb_follow_del()
      returns trigger language plpgsql security definer set search_path = public as $body$
      begin
        if old.created_at::date = current_date then
          perform public.lb_add('follow', old.following_id, -1);
        end if;
        return old;
      end;
      $body$;
    $f$;
    drop trigger if exists trg_lb_follow_del on public.follows;
    create trigger trg_lb_follow_del
      after delete on public.follows
      for each row execute function public.tg_lb_follow_del();
  end if;
end $$;

-- 4) Trigger: Top Bài viết ❤️ — cộng like/unlike vào tác giả của bài
--    CHỈ tính like cho bài viết được đăng trong ngày.
--    Giả định posts(id, user_id, created_at), post_likes(post_id, user_id, created_at).
do $$ begin
  if to_regclass('public.post_likes') is not null and to_regclass('public.posts') is not null then
    execute $f$
      create or replace function public.tg_lb_post_like_ins()
      returns trigger language plpgsql security definer set search_path = public as $body$
      declare _author uuid; _post_day date;
      begin
        select user_id, created_at::date into _author, _post_day
        from public.posts where id = new.post_id;
        if _author is not null and _post_day = current_date then
          perform public.lb_add('posts', _author, 1);
        end if;
        return new;
      end;
      $body$;
    $f$;
    drop trigger if exists trg_lb_post_like_ins on public.post_likes;
    create trigger trg_lb_post_like_ins
      after insert on public.post_likes
      for each row execute function public.tg_lb_post_like_ins();

    execute $f$
      create or replace function public.tg_lb_post_like_del()
      returns trigger language plpgsql security definer set search_path = public as $body$
      declare _author uuid; _post_day date;
      begin
        select user_id, created_at::date into _author, _post_day
        from public.posts where id = old.post_id;
        if _author is not null and _post_day = current_date then
          perform public.lb_add('posts', _author, -1);
        end if;
        return old;
      end;
      $body$;
    $f$;
    drop trigger if exists trg_lb_post_like_del on public.post_likes;
    create trigger trg_lb_post_like_del
      after delete on public.post_likes
      for each row execute function public.tg_lb_post_like_del();
  end if;
end $$;

-- 5) Top Tương Tác ⭐ — gọi từ ứng dụng khi user có hành động tương tác.
--    KHÔNG dùng Gem, KHÔNG dùng Follow, KHÔNG dùng Like.
--    Ví dụ hành động cộng điểm: comment, share, react-emoji, thời gian online...
--    Gọi:  select public.lb_add_interaction(<user_id>, <delta>);
create or replace function public.lb_add_interaction(_user_id uuid, _delta numeric default 1)
returns void
language sql
security definer
set search_path = public
as $$
  select public.lb_add('tuongtac', _user_id, coalesce(_delta, 1));
$$;
grant execute on function public.lb_add_interaction(uuid, numeric) to authenticated, service_role;

-- 6) Reset 00:00 — dùng pg_cron nếu có. KHÔNG xoá dữ liệu ngày cũ (giữ lịch sử).
--    Bảng ghi theo (day), nên sang ngày mới tự có row mới. Việc "reset" là chỉ
--    query day = current_date. Nếu muốn dọn dữ liệu > 30 ngày:
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'leaderboard_daily_prune',
      '5 0 * * *',
      $$delete from public.leaderboard_daily where day < current_date - interval '30 days';$$
    );
  end if;
end $$;
