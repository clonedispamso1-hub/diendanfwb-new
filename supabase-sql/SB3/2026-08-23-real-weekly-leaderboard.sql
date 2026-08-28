-- RUN ON SUPABASE #3 ONLY
-- =====================================================================
-- Bảng xếp hạng TUẦN thật (không còn "Thành viên … / 0")
-- File: supabase-sql/SB3/2026-08-23-real-weekly-leaderboard.sql
-- Target DB: SUPABASE #3 (social: posts, comments, likes, comment_likes,
--            messages, follows). LƯU Ý: #3 KHÔNG có bảng profiles →
--            RPC chỉ trả user_id + score + số liệu thô; avatar / tên / UID
--            do frontend lấy 1 lần theo lô từ Supabase #1.
-- Idempotent: chạy lại nhiều lần an toàn. Không xoá dữ liệu cũ.
-- =====================================================================

-- 1) Bảng trọng số điểm — CẤU HÌNH DUY NHẤT --------------------------------
create table if not exists public.leaderboard_weights (
  key   text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);

grant select on public.leaderboard_weights to anon, authenticated;
grant all    on public.leaderboard_weights to service_role;
alter table public.leaderboard_weights enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard_weights'
      and policyname = 'lb_weights_read'
  ) then
    create policy lb_weights_read on public.leaderboard_weights
      for select to anon, authenticated using (true);
  end if;
end $$;

insert into public.leaderboard_weights (key, value) values
  ('post', 5),
  ('like_given', 1),
  ('comment', 2),
  ('comment_like', 1),
  ('message', 1),
  ('follow_received', 3)
on conflict (key) do nothing;

create or replace function public._lb_weight(_key text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select w.value from public.leaderboard_weights w where w.key = _key), 0)
$$;

grant execute on function public._lb_weight(text) to anon, authenticated, service_role;

-- 2) Bảng lưu điểm tổng hợp theo tuần ------------------------------------
create table if not exists public.weekly_scores (
  user_id      uuid not null,
  week_start   date not null,
  posts        integer not null default 0,
  likes_given  integer not null default 0,
  comments     integer not null default 0,
  comment_likes integer not null default 0,
  messages     integer not null default 0,
  follows_received integer not null default 0,
  score        numeric  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists idx_weekly_scores_week_score
  on public.weekly_scores (week_start, score desc);

grant select on public.weekly_scores to anon, authenticated;
grant all    on public.weekly_scores to service_role;
alter table public.weekly_scores enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'weekly_scores'
      and policyname = 'weekly_scores_read'
  ) then
    create policy weekly_scores_read on public.weekly_scores
      for select to anon, authenticated using (true);
  end if;
end $$;

-- 3) Mốc refresh gần nhất (chống tính lại liên tục) -----------------------
create table if not exists public.leaderboard_refresh_state (
  key          text primary key,
  refreshed_at timestamptz not null default now()
);

grant select on public.leaderboard_refresh_state to anon, authenticated;
grant all    on public.leaderboard_refresh_state to service_role;
alter table public.leaderboard_refresh_state enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard_refresh_state'
      and policyname = 'lb_refresh_read'
  ) then
    create policy lb_refresh_read on public.leaderboard_refresh_state
      for select to anon, authenticated using (true);
  end if;
end $$;

-- 4) Tính lại điểm tuần hiện tại (chạy trên server, không tính ở browser) -
create or replace function public.refresh_weekly_scores()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _ws date := (date_trunc('week', now()))::date;
  _from timestamptz := date_trunc('week', now());
  _n integer := 0;
begin
  with
    p as (
      select user_id as uid, count(*)::int as c
      from public.posts
      where created_at >= _from
        and coalesce(is_hidden, false) = false
        and coalesce(is_deleted, false) = false
      group by user_id
    ),
    l as (
      select user_id as uid, count(*)::int as c
      from public.likes
      where created_at >= _from
      group by user_id
    ),
    c as (
      select user_id as uid, count(*)::int as c
      from public.comments
      where created_at >= _from
        and coalesce(is_hidden, false) = false
      group by user_id
    ),
    cl as (
      select user_id as uid, count(*)::int as c
      from public.comment_likes
      where created_at >= _from
      group by user_id
    ),
    m as (
      select sender_id as uid, count(*)::int as c
      from public.messages
      where created_at >= _from
        and coalesce(is_recalled, false) = false
      group by sender_id
    ),
    f as (
      select following_id as uid, count(*)::int as c
      from public.follows
      where created_at >= _from
      group by following_id
    ),
    ids as (
      select uid from p
      union select uid from l
      union select uid from c
      union select uid from cl
      union select uid from m
      union select uid from f
    ),
    calc as (
      select
        i.uid,
        coalesce(p.c, 0)  as posts,
        coalesce(l.c, 0)  as likes_given,
        coalesce(c.c, 0)  as comments,
        coalesce(cl.c, 0) as comment_likes,
        coalesce(m.c, 0)  as messages,
        coalesce(f.c, 0)  as follows_received
      from ids i
      left join p  on p.uid  = i.uid
      left join l  on l.uid  = i.uid
      left join c  on c.uid  = i.uid
      left join cl on cl.uid = i.uid
      left join m  on m.uid  = i.uid
      left join f  on f.uid  = i.uid
      where i.uid is not null
    )
  insert into public.weekly_scores as ws (
    user_id, week_start, posts, likes_given, comments,
    comment_likes, messages, follows_received, score, updated_at
  )
  select
    k.uid, _ws, k.posts, k.likes_given, k.comments,
    k.comment_likes, k.messages, k.follows_received,
    k.posts            * public._lb_weight('post')
      + k.likes_given  * public._lb_weight('like_given')
      + k.comments     * public._lb_weight('comment')
      + k.comment_likes* public._lb_weight('comment_like')
      + k.messages     * public._lb_weight('message')
      + k.follows_received * public._lb_weight('follow_received'),
    now()
  from calc k
  on conflict (user_id, week_start) do update
    set posts            = excluded.posts,
        likes_given      = excluded.likes_given,
        comments         = excluded.comments,
        comment_likes    = excluded.comment_likes,
        messages         = excluded.messages,
        follows_received = excluded.follows_received,
        score            = excluded.score,
        updated_at       = now();

  get diagnostics _n = row_count;

  -- Dòng điểm 0 (hết hoạt động trong tuần) → xoá để UI không hiện "… / 0".
  delete from public.weekly_scores ws
   where ws.week_start = _ws and ws.score <= 0;

  insert into public.leaderboard_refresh_state (key, refreshed_at)
  values ('weekly', now())
  on conflict (key) do update set refreshed_at = now();

  return _n;
end;
$$;

-- BẢO MẬT: refresh là hàm GHI → chỉ service_role / cron được gọi.
-- Người dùng thường (anon, authenticated) KHÔNG được phép chạy tính điểm.
revoke all on function public.refresh_weekly_scores() from public;
revoke all on function public.refresh_weekly_scores() from anon, authenticated;
grant execute on function public.refresh_weekly_scores() to service_role;

-- 4b) RPC admin/cron có thể gọi qua HTTP với service key ------------------
-- Dùng cho scheduled job (pg_cron / Edge cron / server-side).
create or replace function public.admin_refresh_weekly_scores()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _claim_role text;
  _caller     text := session_user;   -- KHÔNG dùng current_user: security definer
                                      -- luôn cho current_user = owner ⇒ fail-open.
begin
  -- Lấy role từ JWT (PostgREST). Không có JWT ⇒ NULL.
  begin
    _claim_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif((nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role'), '')
    );
  exception when others then
    _claim_role := null;
  end;

  -- FAIL CLOSED:
  --  • Có JWT  ⇒ bắt buộc role = 'service_role'.
  --  • Không JWT (psql/pg_cron) ⇒ bắt buộc session_user là superuser/owner.
  if _claim_role is not null then
    if _claim_role <> 'service_role' then
      raise exception 'forbidden: service_role required (got %)', _claim_role
        using errcode = '42501';
    end if;
  elsif _caller not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'forbidden: admin only (session_user=%)', _caller
      using errcode = '42501';
  end if;

  return public.refresh_weekly_scores();
end;
$$;

revoke all on function public.admin_refresh_weekly_scores() from public;
revoke all on function public.admin_refresh_weekly_scores() from anon, authenticated;
grant execute on function public.admin_refresh_weekly_scores() to service_role;

-- 5) RPC đọc Top 50 — CHỈ ĐỌC (stable), không bao giờ ghi -----------------
-- Người dùng mở modal xếp hạng chỉ SELECT bảng cache weekly_scores.
create or replace function public.leaderboard_weekly(_limit int default 50)
returns table (
  user_id uuid,
  score numeric,
  posts integer,
  likes_given integer,
  comments integer,
  comment_likes integer,
  messages integer,
  follows_received integer
)
language sql
stable                 -- STABLE ⇒ Postgres cấm mọi thao tác ghi bên trong
security definer
set search_path = public
as $$
  select ws.user_id, ws.score, ws.posts, ws.likes_given, ws.comments,
         ws.comment_likes, ws.messages, ws.follows_received
  from public.weekly_scores ws
  where ws.week_start = (date_trunc('week', now()))::date
    and ws.score > 0
  order by ws.score desc, ws.user_id
  limit least(greatest(coalesce(_limit, 50), 1), 50)
$$;

revoke all on function public.leaderboard_weekly(int) from public;
grant execute on function public.leaderboard_weekly(int) to anon, authenticated, service_role;

-- 5b) Thời điểm cache được cập nhật gần nhất (chỉ đọc) --------------------
create or replace function public.leaderboard_weekly_updated_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select r.refreshed_at from public.leaderboard_refresh_state r where r.key = 'weekly'
$$;

grant execute on function public.leaderboard_weekly_updated_at() to anon, authenticated, service_role;

-- 6) RLS: người dùng CHỈ ĐỌC, không sửa trọng số / điểm -------------------
-- Không có policy INSERT/UPDATE/DELETE nào cho anon & authenticated,
-- và quyền bảng cũng chỉ cấp SELECT ⇒ mọi ghi từ client đều bị chặn.
revoke insert, update, delete, truncate on public.leaderboard_weights        from anon, authenticated;
revoke insert, update, delete, truncate on public.weekly_scores              from anon, authenticated;
revoke insert, update, delete, truncate on public.leaderboard_refresh_state  from anon, authenticated;

alter table public.leaderboard_weights       force row level security;
alter table public.weekly_scores             force row level security;
alter table public.leaderboard_refresh_state force row level security;

-- 7) Nạp lần đầu + lịch chạy tự động (chạy bằng service_role/psql) --------
select public.refresh_weekly_scores();

-- Scheduled job: cập nhật cache mỗi 5 phút.
-- • Chỉ chạy khi extension pg_cron ĐÃ tồn tại (không tự tạo extension).
-- • Đúng 1 job duy nhất tên 'candy_refresh_weekly_scores_5min'.
-- • Idempotent: chạy lại file này KHÔNG tạo job trùng (unschedule mọi bản cũ).
do $$
declare
  _job_name constant text := 'candy_refresh_weekly_scores_5min';
  _r record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron chưa được cài → bỏ qua lịch tự động. Hãy chạy public.admin_refresh_weekly_scores() từ job server-side.';
    return;
  end if;

  -- Gỡ mọi job cũ trùng tên (kể cả bản đặt tên cũ 'refresh_weekly_scores').
  for _r in
    select jobid from cron.job
     where jobname in (_job_name, 'refresh_weekly_scores')
  loop
    perform cron.unschedule(_r.jobid);
  end loop;

  perform cron.schedule(
    _job_name, '*/5 * * * *',
    $cron$select public.refresh_weekly_scores();$cron$
  );

  raise notice 'Đã tạo job cron: % (*/5 * * * *)', _job_name;
end $$;

-- Kiểm tra chỉ có 1 job:
--   select jobid, jobname, schedule, active from cron.job
--    where jobname = 'candy_refresh_weekly_scores_5min';

-- Kiểm thử:
--   select * from public.leaderboard_weekly(50);   -- read-only, không ghi
--   select public.refresh_weekly_scores();          -- chỉ service_role
-- =====================================================================

