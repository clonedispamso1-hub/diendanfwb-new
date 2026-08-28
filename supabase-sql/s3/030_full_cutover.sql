-- ============================================================================
-- SUPABASE #3 (uaqsetfdciyzxpuhulux) — CUTOVER TOÀN BỘ PHẦN NẶNG
-- Chạy TOÀN BỘ file này trong SQL Editor của Supabase #3. An toàn khi chạy lại.
--
-- Sau file này, Supabase #3 nhận CẢ ĐỌC LẪN GHI cho:
--   Feed        : posts, comments, likes, comment_likes
--   Mạng xã hội : follows, notifications, profile_views, profile_views_today
--   Chat        : messages, message_reactions, message_gifts, chat_partners,
--                 conversation_clears, group_messages
--   Nhật ký/Bot : activity_logs, admin_logs, agent_activity_logs,
--                 member_activity_log, candy_logs, keyword_logs, dice_logs,
--                 bot_actions_logs, bot_activity_queue, system_health_logs,
--                 security_events, risk_scores, moderation_queue
--
-- Supabase #1 chỉ còn: auth (tài khoản/mật khẩu/session), profiles cốt lõi,
-- danh sách chặn IP/thiết bị + security gate, ví/gem & phân quyền.
--
-- BẢO MẬT: người dùng đăng nhập ở #1 nên token của #1 KHÔNG hợp lệ ở #3
-- (PGRST301). Vì vậy #3 dùng policy cho role `anon` (publishable key), giống
-- cách đã áp dụng cho chat ở `020_chat_anon_bridge.sql`.
-- Khi #3 được bật Third-Party Auth trỏ JWKS của #1: DROP các policy
-- `*_anon_bridge` và tạo lại policy theo `auth.uid()`.
-- ============================================================================

-- ---------------------------------------------------------------- 1. BẢNG MỚI
create table if not exists public.candy_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text,
  amount numeric,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists candy_logs_created_idx on public.candy_logs (created_at desc);
create index if not exists candy_logs_user_idx on public.candy_logs (user_id);

create table if not exists public.system_health_logs (
  id uuid primary key default gen_random_uuid(),
  scope text,
  status text,
  message text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists system_health_logs_created_idx on public.system_health_logs (created_at desc);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_type text,
  ip text,
  device_id text,
  severity text default 'info',
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
create index if not exists security_events_user_idx on public.security_events (user_id);

create table if not exists public.risk_scores (
  user_id uuid primary key,
  score numeric not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);

create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  viewer_id uuid,
  viewed_at timestamptz not null default now()
);
create index if not exists profile_views_profile_idx on public.profile_views (profile_id, viewed_at desc);

create table if not exists public.profile_views_today (
  profile_id uuid not null,
  viewer_id uuid not null,
  day date not null default current_date,
  views integer not null default 1,
  primary key (profile_id, viewer_id, day)
);

-- --------------------------------------------- 2. GRANT + POLICY (anon bridge)
do $$
declare
  t text;
  tables text[] := array[
    -- Feed
    'posts','comments','likes','comment_likes',
    -- Mạng xã hội & thông báo
    'follows','notifications','post_views','profile_views','profile_views_today',
    -- Chat
    'messages','message_reactions','message_gifts','chat_partners',
    'conversation_clears','group_messages','chat_group_messages','virtual_chat_messages',
    -- Nhật ký & bot
    'activity_logs','admin_logs','agent_activity_logs','member_activity_log',
    'candy_logs','keyword_logs','dice_logs','bot_actions_logs','bot_activity_queue',
    'system_health_logs','security_events','risk_scores','moderation_queue',
    'engagement_events','engagement_points_log','engagement_campaigns',
    'rate_limit_hits','spam_detection_logs','group_stats_log','group_leave_log'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'bỏ qua (chưa có bảng): %', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format('drop policy if exists %I on public.%I', t || '_anon_bridge', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_anon_bridge', t
    );
  end loop;
end $$;

-- Sequence (nếu bảng nào dùng id bigserial) — tránh lỗi "permission denied for sequence".
do $$
declare s record;
begin
  for s in select schemaname, sequencename from pg_sequences where schemaname = 'public' loop
    execute format('grant usage, select on sequence %I.%I to anon, authenticated', s.schemaname, s.sequencename);
  end loop;
end $$;

-- ------------------------------------------------------------- 3. COUNTERS
-- Feed đã ghi trực tiếp ở #3 nên likes_count / comments_count phải do trigger ở
-- #3 cập nhật (trigger cũ nằm ở #1 không còn được gọi).
create or replace function public.s3_bump_post_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta int := case when tg_op = 'INSERT' then 1 else -1 end;
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_table_name = 'likes' then
    update public.posts set likes_count = greatest(0, likes_count + delta) where id = pid;
  elsif tg_table_name = 'comments' then
    update public.posts set comments_count = greatest(0, comments_count + delta) where id = pid;
  end if;
  return null;
end $$;

drop trigger if exists s3_likes_counter on public.likes;
create trigger s3_likes_counter
after insert or delete on public.likes
for each row execute function public.s3_bump_post_counters();

drop trigger if exists s3_comments_counter on public.comments;
create trigger s3_comments_counter
after insert or delete on public.comments
for each row execute function public.s3_bump_post_counters();

-- ------------------------------------------------------------- 4. REALTIME
do $$
declare
  t text;
  rt text[] := array[
    'posts','comments','likes','follows','notifications',
    'messages','message_reactions','conversation_clears','group_messages',
    'admin_logs','activity_logs','moderation_queue','bot_activity_queue'
  ];
begin
  foreach t in array rt loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------------ 5. KIỂM TRA
-- select relname, count(*) filter (where polname is not null) as policies
-- from pg_class c left join pg_policy p on p.polrelid = c.oid
-- where relnamespace = 'public'::regnamespace and relkind = 'r'
-- group by relname order by relname;
