-- RUN ON SUPABASE #3 ONLY
-- =====================================================================
-- Bảng xếp hạng TUẦN — công thức điểm v2 (chỉ cập nhật phần TÍNH ĐIỂM).
-- File: supabase-sql/SB3/2026-08-24-leaderboard-scoring-v2.sql
--
-- Quy tắc mới (tuần hiện tại):
--   • Đăng bài mới          : +50 điểm / bài
--   • Tin nhắn gửi đi       : +1 điểm / tin hợp lệ (không bị thu hồi)
--   • Bình luận bài NGƯỜI KHÁC: +5 điểm, TỐI ĐA 1 lần / người / ngày dương lịch
--     (bình luận bài của chính mình = 0 điểm)
--   • BỎ hoàn toàn like / follow / comment_like khỏi điểm.
--
-- Bao gồm cả tài khoản thường VÀ tài khoản nội bộ/clone của Admin.
-- Refresh vẫn CHỈ chạy server-side; người dùng thường chỉ đọc Top 50.
-- Idempotent: chạy lại nhiều lần an toàn, không xoá dữ liệu.
-- =====================================================================

-- 0) Yêu cầu: đã chạy 2026-08-23-real-weekly-leaderboard-FINAL.sql --------
--    (tạo leaderboard_weights, weekly_scores, leaderboard_refresh_state)

-- 1) Trọng số v2 — cập nhật giá trị (không dùng ON CONFLICT DO NOTHING) ---
insert into public.leaderboard_weights (key, value) values
  ('post',            50),
  ('message',          1),
  ('comment_daily',    5),
  -- Vô hiệu hoá các trọng số cũ (giữ dòng để không vỡ cấu hình cũ).
  ('comment',          0),
  ('like_given',       0),
  ('comment_like',     0),
  ('follow_received',  0)
on conflict (key) do update
  set value = excluded.value, updated_at = now();

-- 2) Cột lưu số NGÀY có bình luận hợp lệ ---------------------------------
alter table public.weekly_scores
  add column if not exists comment_days integer not null default 0;

-- 3) Tính lại điểm tuần hiện tại — công thức v2 --------------------------
create or replace function public.refresh_weekly_scores()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _ws   date        := (date_trunc('week', now()))::date;
  _from timestamptz := date_trunc('week', now());
  _n    integer     := 0;
begin
  with
    -- Bài viết mới (+50/bài)
    p as (
      select user_id as uid, count(*)::int as c
      from public.posts
      where created_at >= _from
        and coalesce(is_hidden, false) = false
        and coalesce(is_deleted, false) = false
      group by user_id
    ),
    -- Tin nhắn gửi đi (+1/tin, bỏ tin đã thu hồi)
    m as (
      select sender_id as uid, count(*)::int as c
      from public.messages
      where created_at >= _from
        and coalesce(is_recalled, false) = false
      group by sender_id
    ),
    -- Bình luận bài NGƯỜI KHÁC: tối đa 1 ngày dương lịch tính 1 lần (+5)
    cd as (
      select c.user_id as uid,
             count(distinct ((c.created_at at time zone 'Asia/Ho_Chi_Minh')::date))::int as c
      from public.comments c
      join public.posts po on po.id = c.post_id
      where c.created_at >= _from
        and coalesce(c.is_hidden, false) = false
        and po.user_id is distinct from c.user_id
      group by c.user_id
    ),
    ids as (
      select uid from p
      union select uid from m
      union select uid from cd
    ),
    calc as (
      select
        i.uid,
        coalesce(p.c, 0)  as posts,
        coalesce(m.c, 0)  as messages,
        coalesce(cd.c, 0) as comment_days
      from ids i
      left join p  on p.uid  = i.uid
      left join m  on m.uid  = i.uid
      left join cd on cd.uid = i.uid
      where i.uid is not null
    )
  insert into public.weekly_scores as ws (
    user_id, week_start, posts, likes_given, comments,
    comment_likes, messages, follows_received, comment_days, score, updated_at
  )
  select
    k.uid, _ws,
    k.posts,
    0,                 -- likes_given: không còn tính điểm
    k.comment_days,    -- "comments" giờ = số ngày bình luận hợp lệ
    0,                 -- comment_likes: không còn tính điểm
    k.messages,
    0,                 -- follows_received: không còn tính điểm
    k.comment_days,
      k.posts        * public._lb_weight('post')
    + k.messages     * public._lb_weight('message')
    + k.comment_days * public._lb_weight('comment_daily'),
    now()
  from calc k
  on conflict (user_id, week_start) do update
    set posts            = excluded.posts,
        likes_given      = 0,
        comments         = excluded.comments,
        comment_likes    = 0,
        messages         = excluded.messages,
        follows_received = 0,
        comment_days     = excluded.comment_days,
        score            = excluded.score,
        updated_at       = now();

  get diagnostics _n = row_count;

  -- Dòng điểm 0 → xoá để UI không hiện hàng "Thành viên … / 0".
  delete from public.weekly_scores ws
   where ws.week_start = _ws and ws.score <= 0;

  insert into public.leaderboard_refresh_state (key, refreshed_at)
  values ('weekly', now())
  on conflict (key) do update set refreshed_at = now();

  return _n;
end;
$$;

-- Quyền: refresh là hàm GHI → chỉ service_role / cron.
revoke all on function public.refresh_weekly_scores() from public;
revoke all on function public.refresh_weekly_scores() from anon, authenticated;
grant execute on function public.refresh_weekly_scores() to service_role;

-- 4) RPC đọc Top 50 — bổ sung comment_days (chỉ đọc) ---------------------
drop function if exists public.leaderboard_weekly(int);

create or replace function public.leaderboard_weekly(_limit int default 50)
returns table (
  user_id      uuid,
  score        numeric,
  posts        integer,
  messages     integer,
  comment_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select ws.user_id, ws.score, ws.posts, ws.messages, ws.comment_days
  from public.weekly_scores ws
  where ws.week_start = (date_trunc('week', now()))::date
    and ws.score > 0
  order by ws.score desc, ws.user_id
  limit least(greatest(coalesce(_limit, 50), 1), 50)
$$;

revoke all on function public.leaderboard_weekly(int) from public;
grant execute on function public.leaderboard_weekly(int) to anon, authenticated, service_role;

-- 5) Nạp lại ngay bằng công thức mới (chạy với service_role/psql) --------
select public.refresh_weekly_scores();

-- Kiểm thử:
--   select * from public.leaderboard_weekly(50);
-- =====================================================================
