-- Top Donate 24h: tổng amount của các giao dịch tip_post từ 00:00 hôm nay (theo UTC server)
-- Reset tự động vào 00:00 mỗi ngày vì WHERE clause dùng date_trunc('day', now()).
create or replace function public.get_top_donate_24h(p_limit int default 10)
returns table (
  user_id uuid,
  total_amount bigint,
  full_name text,
  username text,
  avatar text,
  vip_level int,
  title_gif_url text,
  location text
)
language sql
stable
security definer
set search_path = public
as $$
  with sums as (
    select from_id as uid, sum(amount)::bigint as total
    from public.gem_transactions
    where action_type in ('tip_post', 'transfer')
      and from_id is not null
      and created_at >= date_trunc('day', now())
    group by from_id
  )
  select
    s.uid,
    s.total,
    p.full_name,
    p.username,
    p.avatar,
    p.vip_level,
    p.title_gif_url,
    p.location
  from sums s
  left join public.profiles p on p.id = s.uid
  order by s.total desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.get_top_donate_24h(int) to anon, authenticated;
