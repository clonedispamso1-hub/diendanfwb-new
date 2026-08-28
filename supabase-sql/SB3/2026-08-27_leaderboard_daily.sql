-- RUN ON SUPABASE #3 ONLY
-- =====================================================================
-- BẢNG XẾP HẠNG TƯƠNG TÁC THEO NGÀY (Top 10 hiển thị ngoài Client).
-- File: supabase-sql/SB3/2026-08-27_leaderboard_daily.sql
--
-- Quy tắc điểm (chỉ tính dữ liệu phát sinh TRONG NGÀY, giờ Asia/Ho_Chi_Minh):
--   • Đăng bài mới             : +50 / bài
--   • Thả tim (like) bài viết  : +2  / lượt
--   • Gửi tin nhắn             : +1  / tin (bỏ tin thu hồi)
--   • Bình luận bài NGƯỜI KHÁC : +5  / bình luận
--     (tự bình luận vào bài của chính mình = 0 điểm)
--
-- CHỈ ĐỌC: không tạo bảng mới, không ghi, không đụng dữ liệu cũ.
-- Điểm tự "reset" theo ngày vì hàm chỉ gộp dữ liệu của ngày hiện tại.
-- Idempotent: chạy lại nhiều lần an toàn.
-- =====================================================================

drop function if exists public.leaderboard_daily(int);

create or replace function public.leaderboard_daily(_limit int default 10)
returns table (
  user_id  uuid,
  score    numeric,
  posts    integer,
  likes    integer,
  messages integer,
  comments integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (((now() at time zone 'Asia/Ho_Chi_Minh')::date)::timestamp
             at time zone 'Asia/Ho_Chi_Minh') as day_start
  ),
  p as (
    select po.user_id as uid, count(*)::int as c
    from public.posts po, bounds b
    where po.created_at >= b.day_start
      and coalesce(po.is_hidden, false) = false
      and coalesce(po.is_deleted, false) = false
    group by po.user_id
  ),
  l as (
    select lk.user_id as uid, count(*)::int as c
    from public.likes lk, bounds b
    where lk.created_at >= b.day_start
    group by lk.user_id
  ),
  m as (
    select ms.sender_id as uid, count(*)::int as c
    from public.messages ms, bounds b
    where ms.created_at >= b.day_start
      and coalesce(ms.is_recalled, false) = false
    group by ms.sender_id
  ),
  c as (
    select cm.user_id as uid, count(*)::int as c
    from public.comments cm
    join public.posts po on po.id = cm.post_id
    cross join bounds b
    where cm.created_at >= b.day_start
      and coalesce(cm.is_hidden, false) = false
      and po.user_id is distinct from cm.user_id
    group by cm.user_id
  ),
  ids as (
    select uid from p
    union select uid from l
    union select uid from m
    union select uid from c
  )
  select
    i.uid as user_id,
    (coalesce(p.c,0) * 50 + coalesce(l.c,0) * 2 + coalesce(m.c,0) * 1 + coalesce(c.c,0) * 5)::numeric as score,
    coalesce(p.c,0) as posts,
    coalesce(l.c,0) as likes,
    coalesce(m.c,0) as messages,
    coalesce(c.c,0) as comments
  from ids i
  left join p on p.uid = i.uid
  left join l on l.uid = i.uid
  left join m on m.uid = i.uid
  left join c on c.uid = i.uid
  where i.uid is not null
    and (coalesce(p.c,0) * 50 + coalesce(l.c,0) * 2 + coalesce(m.c,0) * 1 + coalesce(c.c,0) * 5) > 0
  order by score desc, i.uid
  limit least(greatest(coalesce(_limit, 10), 1), 50)
$$;

revoke all on function public.leaderboard_daily(int) from public;
grant execute on function public.leaderboard_daily(int) to anon, authenticated, service_role;

-- Kiểm thử:
--   select * from public.leaderboard_daily(10);
-- =====================================================================
