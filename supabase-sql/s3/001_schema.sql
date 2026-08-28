-- =============================================================================
-- Supabase 3 (uaqsetfdciyzxpuhulux) - schema cho cac bang tai nang chuyen tu
-- Supabase 1. Sinh tu pg_dump cua Supabase 1, giu nguyen cot / index / RLS /
-- trigger. Chay idempotent.
-- Bang chuyen: messages, message_reactions, message_gifts, chat_partners, conversation_clears, group_messages, chat_group_messages, virtual_chat_messages, notifications, post_views, activity_logs, engagement_points_log, engagement_events, rate_limit_hits, keyword_logs, member_activity_log, group_leave_log, group_stats_log, spam_detection_logs
-- =============================================================================
SET check_function_bodies = false;
DO $$ BEGIN CREATE TYPE public.admin_permission AS ENUM ('super_admin','manage_users','manage_bots','manage_reports','manage_finance','manage_live','manage_security','manage_analytics','manage_system_health','manage_shadowban','manage_posts','moderation_admin','finance_admin','support_admin','analytics_admin','bot_admin','live_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.admin_role AS ENUM ('super_admin','moderation_admin','finance_admin','support_admin','analytics_admin','bot_admin','live_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','moderator','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bangchu_role AS ENUM ('admin_1','admin_2','agent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bangchu_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bot_role AS ENUM ('super_admin','admin','moderator','bot_manager','reviewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bot_type AS ENUM ('engagement_bot','moderation_bot','spam_guard','comment_guard','register_guard','risk_detection_bot'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_gift_status AS ENUM ('pending','claimed','refunded','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.mod_status AS ENUM ('pending','approved','rejected','auto_hidden','escalated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.popup_trigger AS ENUM ('once','every_login','every_refresh','every_hours','every_days','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.popup_type AS ENUM ('announcement','maintenance','promotion','event','warning','update','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.post_category AS ENUM ('ons','fwb','love','dating','private','feedback','important','general'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.queue_status AS ENUM ('pending','processing','done','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.risk_level AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- 1. Cau hinh ket noi doc-nguoc ve Supabase 1 (chi doc cac bang loi: profiles,
--    posts, groups...). Cac trigger/policy da chuyen van join duoc nhu cu.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE SCHEMA IF NOT EXISTS s1;

DO $$ BEGIN
  CREATE SERVER s1_core FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host '__S1_HOST__', port '__S1_PORT__', dbname '__S1_DB__', fetch_size '1000');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE USER MAPPING FOR CURRENT_USER SERVER s1_core OPTIONS (user '__S1_USER__', password '__S1_PASSWORD__');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE USER MAPPING FOR postgres SERVER s1_core OPTIONS (user '__S1_USER__', password '__S1_PASSWORD__');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE USER MAPPING FOR authenticated SERVER s1_core OPTIONS (user '__S1_USER__', password '__S1_PASSWORD__');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE USER MAPPING FOR service_role SERVER s1_core OPTIONS (user '__S1_USER__', password '__S1_PASSWORD__');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

IMPORT FOREIGN SCHEMA public LIMIT TO (profiles, posts, groups, group_members, bangchu, bot_roles, user_roles, user_restrictions, seed_accounts, chat_groups, engagement_campaigns)
  FROM SERVER s1_core INTO s1;

GRANT USAGE ON SCHEMA s1 TO authenticated, service_role, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA s1 TO authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 2. Ham ho tro (copy tu Supabase 1, cac bang loi doi sang schema s1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_message(_message_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = _message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.enforce_restriction(_kind text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row s1.user_restrictions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- suspend luôn chặn TOÀN BỘ hành động khác
  SELECT * INTO v_row
  FROM s1.user_restrictions
  WHERE user_id = v_uid
    AND kind IN ('suspend', _kind)
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY (kind = 'suspend') DESC, created_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RAISE EXCEPTION 'RESTRICTED:%:%:%',
      v_row.kind,
      COALESCE(v_row.reason, ''),
      COALESCE(to_char(v_row.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'permanent')
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_bot_role(_user_id uuid, _role bot_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
declare
  v_ok boolean := false;
begin
  if _user_id is null then return false; end if;

  if to_regclass('s1.bot_roles') is not null then
    select exists(select 1 from s1.bot_roles
      where user_id = _user_id and role = _role) into v_ok;
    if v_ok then return true; end if;
  end if;

  -- Super admin / admin fallback to existing profiles.is_admin flag
  if _role in ('super_admin','admin') then
    select coalesce(p.is_admin, false) into v_ok
      from s1.profiles p where p.id = _user_id;
    return coalesce(v_ok, false);
  end if;

  return false;
end $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
begin
  if to_regclass('s1.user_roles') is not null then
    return exists (
      select 1
      from s1.user_roles
      where user_id = _user_id
        and role::text = _role
    );
  end if;

  return _role = 'admin'
    and exists (
      select 1
      from s1.profiles
      where id = _user_id
        and coalesce(is_admin, false) = true
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  SELECT EXISTS (SELECT 1 FROM s1.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

CREATE OR REPLACE FUNCTION public.is_active_bangchu(_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  select exists(
    select 1 from s1.bangchu
    where auth_user_id = _user
      and status = 'approved'
      and is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM s1.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  select exists (
    select 1 from s1.group_members
    where group_id = _group_id and user_id = _user_id and left_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  select exists (
    select 1 from s1.groups
    where id = _group_id and owner_id = _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_hard_banned(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  SELECT COALESCE((
    SELECT COALESCE(p.ban_level, 0) >= 3 AND COALESCE(p.is_admin, false) = false
    FROM s1.profiles p
    WHERE p.id = _uid
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.notif_actor_name(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
  select coalesce(p.full_name, p.username, 'Người dùng')
    from s1.profiles p where p.id = p_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.notif_real_dedup_key(p_type text, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  t text := lower(coalesce(p_type, ''));
  d jsonb := coalesce(p_data, '{}'::jsonb);
  target text;
  actor text;
  milestone text;
BEGIN
  -- Raw like notifications. The canonical identifier is the liked entity id
  -- inside data JSON, not an empty fallback. These rows are mostly hidden by
  -- the UI, but if old triggers still create them they must not duplicate.
  IF t IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like') THEN
    target := nullif(coalesce(
      d->>'post_id',
      d->>'target_post_id',
      d->>'video_id',
      d->>'target_video_id',
      d->>'comment_id',
      d->>'target_comment_id',
      d->>'reply_id',
      d->>'target_id',
      d->>'entity_id'
    ), '');
    IF target IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN t || ':' || target;
  END IF;

  -- Like milestone notifications are already generated once per post+milestone.
  IF t = 'like_milestone' THEN
    target := nullif(coalesce(d->>'post_id', d->>'target_post_id', d->>'target_id'), '');
    milestone := nullif(d->>'milestone', '');
    IF target IS NULL OR milestone IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target || ':' || milestone;
  END IF;

  -- Comment/reply notifications: comment id is the strongest key. If the
  -- creator path did not include comment_id, fall back only when both target
  -- post/video and actor are present.
  IF t IN ('comment_post', 'comment_video', 'comment', 'reply', 'comment_reply', 'post_comment', 'video_comment', 'new_comment') THEN
    target := nullif(coalesce(d->>'comment_id', d->>'reply_id', d->>'target_comment_id'), '');
    IF target IS NOT NULL THEN RETURN t || ':comment:' || target; END IF;

    target := nullif(coalesce(d->>'post_id', d->>'target_post_id', d->>'video_id', d->>'target_video_id', d->>'target_id'), '');
    actor := nullif(coalesce(d->>'sender_id', d->>'actor_id', d->>'from_id', d->>'from_user_id', d->>'commenter_id'), '');
    IF target IS NOT NULL AND actor IS NOT NULL THEN
      RETURN t || ':fallback:' || target || ':' || actor;
    END IF;
    RETURN NULL;
  END IF;

  -- Rewards/gifts must be deduped by transaction/gift/claim identifiers, not
  -- by post_id alone, because the same sender can send multiple gifts to the
  -- same post/video.
  IF t IN ('gift_post', 'gift_video', 'candy_transfer', 'gem_transfer', 'transfer_gem', 'gem_received') THEN
    target := nullif(coalesce(d->>'transaction_id', d->>'tx_id', d->>'tx', d->>'gift_id'), '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  -- One pending red-packet claim per recipient/post is the real business rule.
  IF t IN ('red_packet_pending', 'red_packet_claimed') THEN
    target := nullif(coalesce(d->>'claim_id', d->>'post_id', d->>'red_packet_id'), '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  IF t = 'profile_view_agg' THEN
    target := nullif(coalesce(d->>'view_date', d->>'date'), '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  IF t IN ('follow', 'new_follower') THEN
    actor := nullif(coalesce(d->>'sender_id', d->>'actor_id', d->>'from_id', d->>'from_user_id', d->>'follower_id', d->>'user_id'), '');
    IF actor IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || actor;
  END IF;

  IF t = 'connection_request' THEN
    target := nullif(d->>'request_id', '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_message_reactions_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Bang + index + RLS + policy + trigger (pg_dump cua Supabase 1)
-- ---------------------------------------------------------------------------
--
-- PostgreSQL database dump
--



-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

















--
-- Name: message_gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_gifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    gift_key text NOT NULL,
    gift_name text NOT NULL,
    gift_emoji text NOT NULL,
    amount bigint NOT NULL,
    status public.message_gift_status DEFAULT 'pending'::public.message_gift_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    refunded_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    CONSTRAINT message_gifts_amount_check CHECK ((amount > 0))
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action_type text NOT NULL,
    target_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text
);


--
-- Name: chat_group_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_group_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_partners (
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_clears; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_clears (
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    cleared_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: engagement_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_events (
    id bigint NOT NULL,
    campaign_id uuid NOT NULL,
    post_id uuid NOT NULL,
    kind text NOT NULL,
    delta integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: engagement_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engagement_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: engagement_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engagement_events_id_seq OWNED BY public.engagement_events.id;


--
-- Name: engagement_points_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_points_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    points integer NOT NULL,
    ref_table text,
    ref_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: engagement_points_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engagement_points_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: engagement_points_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engagement_points_log_id_seq OWNED BY public.engagement_points_log.id;


--
-- Name: group_leave_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_leave_log (
    user_id uuid NOT NULL,
    left_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: group_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text,
    is_archived boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text
);


--
-- Name: group_stats_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_stats_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    cycle_started_at timestamp with time zone NOT NULL,
    cycle_ended_at timestamp with time zone DEFAULT now() NOT NULL,
    message_count integer NOT NULL,
    total_coins_earned integer NOT NULL
);


--
-- Name: keyword_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keyword_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    post_id uuid,
    post_content text,
    keyword text,
    severity text,
    penalty integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    matched_keyword text,
    context_type text,
    ip_address text,
    device text,
    username text,
    content text
);


--
-- Name: member_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    detail text,
    ip text,
    fingerprint text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_reactions_emoji_check CHECK ((emoji = ANY (ARRAY['👍'::text, '❤️'::text, '😂'::text, '😮'::text, '😢'::text, '😡'::text])))
);

ALTER TABLE ONLY public.message_reactions REPLICA IDENTITY FULL;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    sender_deleted_at timestamp with time zone,
    receiver_deleted_at timestamp with time zone,
    edited_at timestamp with time zone,
    is_recalled boolean DEFAULT false NOT NULL,
    recalled_at timestamp with time zone,
    message_type text DEFAULT 'text'::text NOT NULL,
    voice_url text,
    voice_duration integer
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    content text,
    related_id uuid,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    message text,
    data jsonb,
    title text,
    is_claimed boolean DEFAULT false NOT NULL,
    is_pending_claim boolean DEFAULT false NOT NULL,
    dedup_key text,
    kind text,
    entity_type text,
    entity_id text,
    actor_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    actors_count integer DEFAULT 0 NOT NULL,
    last_actor_id uuid,
    link text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


--
-- Name: post_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_views (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_hits (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    hit_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_hits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rate_limit_hits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limit_hits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rate_limit_hits_id_seq OWNED BY public.rate_limit_hits.id;


--
-- Name: spam_detection_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spam_detection_logs (
    id bigint NOT NULL,
    user_id uuid,
    surface text NOT NULL,
    signal text NOT NULL,
    weight integer DEFAULT 0 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    ip inet,
    fingerprint text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spam_detection_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spam_detection_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spam_detection_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spam_detection_logs_id_seq OWNED BY public.spam_detection_logs.id;


--
-- Name: virtual_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.virtual_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    sender_id uuid,
    receiver_id uuid,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    admin_replied boolean DEFAULT false
);


--
-- Name: engagement_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_events ALTER COLUMN id SET DEFAULT nextval('public.engagement_events_id_seq'::regclass);


--
-- Name: engagement_points_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_points_log ALTER COLUMN id SET DEFAULT nextval('public.engagement_points_log_id_seq'::regclass);


--
-- Name: rate_limit_hits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_hits ALTER COLUMN id SET DEFAULT nextval('public.rate_limit_hits_id_seq'::regclass);


--
-- Name: spam_detection_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spam_detection_logs ALTER COLUMN id SET DEFAULT nextval('public.spam_detection_logs_id_seq'::regclass);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: chat_group_messages chat_group_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_messages
    ADD CONSTRAINT chat_group_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_partners chat_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_partners
    ADD CONSTRAINT chat_partners_pkey PRIMARY KEY (user_id, partner_id);


--
-- Name: conversation_clears conversation_clears_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_clears
    ADD CONSTRAINT conversation_clears_pkey PRIMARY KEY (user_id, partner_id);


--
-- Name: engagement_events engagement_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_events
    ADD CONSTRAINT engagement_events_pkey PRIMARY KEY (id);


--
-- Name: engagement_points_log engagement_points_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_points_log
    ADD CONSTRAINT engagement_points_log_pkey PRIMARY KEY (id);


--
-- Name: group_leave_log group_leave_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_leave_log
    ADD CONSTRAINT group_leave_log_pkey PRIMARY KEY (user_id, left_at);


--
-- Name: group_messages group_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);


--
-- Name: group_stats_log group_stats_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_stats_log
    ADD CONSTRAINT group_stats_log_pkey PRIMARY KEY (id);


--
-- Name: keyword_logs keyword_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_logs
    ADD CONSTRAINT keyword_logs_pkey PRIMARY KEY (id);


--
-- Name: member_activity_log member_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_activity_log
    ADD CONSTRAINT member_activity_log_pkey PRIMARY KEY (id);


--
-- Name: message_gifts message_gifts_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_gifts
    ADD CONSTRAINT message_gifts_message_id_key UNIQUE (message_id);


--
-- Name: message_gifts message_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_gifts
    ADD CONSTRAINT message_gifts_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_user_message_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_message_unique UNIQUE (message_id, user_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: post_views post_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: rate_limit_hits rate_limit_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_hits
    ADD CONSTRAINT rate_limit_hits_pkey PRIMARY KEY (id);


--
-- Name: spam_detection_logs spam_detection_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spam_detection_logs
    ADD CONSTRAINT spam_detection_logs_pkey PRIMARY KEY (id);


--
-- Name: virtual_chat_messages virtual_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_chat_messages
    ADD CONSTRAINT virtual_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: activity_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_action_idx ON public.activity_logs USING btree (action_type);


--
-- Name: activity_logs_user_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_user_time_idx ON public.activity_logs USING btree (user_id, created_at DESC);


--
-- Name: engagement_events_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engagement_events_campaign_idx ON public.engagement_events USING btree (campaign_id, created_at DESC);


--
-- Name: engagement_points_log_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engagement_points_log_user_created_idx ON public.engagement_points_log USING btree (user_id, created_at DESC);


--
-- Name: idx_cgmsg_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cgmsg_group ON public.chat_group_messages USING btree (group_id, created_at DESC);


--
-- Name: idx_conv_clears_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_clears_user ON public.conversation_clears USING btree (user_id);


--
-- Name: idx_group_messages_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_messages_archived ON public.group_messages USING btree (is_archived, archived_at);


--
-- Name: idx_group_messages_group_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_messages_group_time ON public.group_messages USING btree (group_id, created_at DESC);


--
-- Name: idx_group_stats_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_stats_group ON public.group_stats_log USING btree (group_id, cycle_ended_at DESC);


--
-- Name: idx_keyword_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyword_logs_created ON public.keyword_logs USING btree (created_at DESC);


--
-- Name: idx_keyword_logs_kw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyword_logs_kw ON public.keyword_logs USING btree (matched_keyword);


--
-- Name: idx_keyword_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyword_logs_user ON public.keyword_logs USING btree (user_id);


--
-- Name: idx_message_gifts_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_gifts_expires ON public.message_gifts USING btree (expires_at) WHERE (status = 'pending'::public.message_gift_status);


--
-- Name: idx_message_gifts_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_gifts_msg ON public.message_gifts USING btree (message_id);


--
-- Name: idx_message_gifts_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_gifts_receiver ON public.message_gifts USING btree (receiver_id, status);


--
-- Name: idx_message_gifts_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_gifts_sender ON public.message_gifts USING btree (sender_id, status);


--
-- Name: idx_messages_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_pair ON public.messages USING btree (sender_id, receiver_id, created_at DESC);


--
-- Name: idx_messages_pair_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_pair_created ON public.messages USING btree (sender_id, receiver_id, created_at DESC);


--
-- Name: idx_messages_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_receiver ON public.messages USING btree (receiver_id, is_read);


--
-- Name: idx_messages_receiver_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_receiver_deleted_at ON public.messages USING btree (receiver_id) WHERE (receiver_deleted_at IS NULL);


--
-- Name: idx_messages_sender_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_deleted_at ON public.messages USING btree (sender_id) WHERE (sender_deleted_at IS NULL);


--
-- Name: idx_notif_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_pending ON public.notifications USING btree (user_id) WHERE (is_pending_claim = true);


--
-- Name: idx_notif_user_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_user_kind ON public.notifications USING btree (user_id, ((data ->> 'kind'::text)));


--
-- Name: idx_notifications_follow_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_follow_actor ON public.notifications USING btree (((data ->> 'actor_id'::text))) WHERE (type = ANY (ARRAY['follow'::text, 'new_follower'::text]));


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (is_read = false);


--
-- Name: idx_notifications_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created_at ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_type_created ON public.notifications USING btree (user_id, type, created_at DESC);


--
-- Name: idx_notifications_user_unclaimed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unclaimed ON public.notifications USING btree (user_id) WHERE (is_claimed = false);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: idx_notifications_user_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_updated ON public.notifications USING btree (user_id, updated_at DESC);


--
-- Name: idx_post_views_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_views_post ON public.post_views USING btree (post_id);


--
-- Name: idx_post_views_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_views_post_id ON public.post_views USING btree (post_id);


--
-- Name: idx_sdl_signal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdl_signal ON public.spam_detection_logs USING btree (signal, created_at DESC);


--
-- Name: idx_sdl_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdl_user ON public.spam_detection_logs USING btree (user_id, created_at DESC);


--
-- Name: keyword_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX keyword_logs_created_idx ON public.keyword_logs USING btree (created_at DESC);


--
-- Name: keyword_logs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX keyword_logs_user_idx ON public.keyword_logs USING btree (user_id, created_at DESC);


--
-- Name: member_activity_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_activity_user_idx ON public.member_activity_log USING btree (user_id, created_at DESC);


--
-- Name: message_reactions_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_reactions_message_id_idx ON public.message_reactions USING btree (message_id);


--
-- Name: message_reactions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_reactions_user_id_idx ON public.message_reactions USING btree (user_id);


--
-- Name: messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_created_at_idx ON public.messages USING btree (created_at);


--
-- Name: messages_receiver_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_receiver_created_idx ON public.messages USING btree (receiver_id, created_at DESC);


--
-- Name: messages_sender_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_sender_created_idx ON public.messages USING btree (sender_id, created_at DESC);


--
-- Name: notifications_created_at_idx2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_idx2 ON public.notifications USING btree (created_at);


--
-- Name: notifications_like_dedup_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notifications_like_dedup_uidx ON public.notifications USING btree (user_id, type, dedup_key) WHERE ((type = ANY (ARRAY['like'::text, 'like_post'::text, 'post_like'::text, 'like_video'::text, 'video_like'::text, 'comment_like'::text])) AND (dedup_key IS NOT NULL));


--
-- Name: notifications_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: rate_limit_hits_user_action_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limit_hits_user_action_time_idx ON public.rate_limit_hits USING btree (user_id, action, hit_at DESC);


--
-- Name: uniq_notifications_agg; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_notifications_agg ON public.notifications USING btree (user_id, kind, entity_type, entity_id);


--
-- Name: uniq_post_views_post_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_post_views_post_user ON public.post_views USING btree (post_id, user_id);


--
-- Name: message_reactions message_reactions_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER message_reactions_touch_updated_at BEFORE UPDATE ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION public.tg_message_reactions_touch_updated_at();


--
-- Name: post_views post_views_bump_post_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER post_views_bump_post_count AFTER INSERT OR DELETE ON public.post_views FOR EACH ROW EXECUTE FUNCTION public._bump_post_views_count();


--
-- Name: notifications protect_pending_dragon_notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_pending_dragon_notifications BEFORE DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.protect_pending_dragon_notifications();


--
-- Name: group_messages trg_group_messages_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_group_messages_after_insert AFTER INSERT ON public.group_messages FOR EACH ROW EXECUTE FUNCTION public.group_messages_after_insert();


--
-- Name: notifications trg_guard_pending_gift_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_pending_gift_notification BEFORE DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.guard_pending_gift_notification();


--
-- Name: notifications trg_notifications_00_prepare_dedup_key; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_00_prepare_dedup_key BEFORE INSERT OR UPDATE OF type, data ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_prepare_dedup_key();


--
-- Name: notifications trg_notifications_aggregate_like; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_aggregate_like BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_aggregate_like();


--
-- Name: notifications trg_notifications_dedup_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_dedup_comment BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_dedup_comment();


--
-- Name: notifications trg_notifications_sync_content; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_sync_content BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_sync_content();


--
-- Name: messages trg_notify_on_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_on_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();


--
-- Name: messages trg_remember_chat_partners; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remember_chat_partners AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.remember_chat_partners();


--
-- Name: messages trg_restrict_messages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_restrict_messages BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public._trg_restrict_messages();


--
-- Name: messages trigger_points_on_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_points_on_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.handle_interaction_points();


--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_group_messages chat_group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.chat_group_messages ADD CONSTRAINT chat_group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES s1.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_group_messages chat_group_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.chat_group_messages ADD CONSTRAINT chat_group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_clears conversation_clears_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.conversation_clears ADD CONSTRAINT conversation_clears_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: engagement_events engagement_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.engagement_events ADD CONSTRAINT engagement_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES s1.engagement_campaigns(id) ON DELETE CASCADE;


--
-- Name: engagement_points_log engagement_points_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.engagement_points_log ADD CONSTRAINT engagement_points_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_leave_log group_leave_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.group_leave_log ADD CONSTRAINT group_leave_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.group_messages ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES s1.groups(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.group_messages ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_stats_log group_stats_log_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.group_stats_log ADD CONSTRAINT group_stats_log_group_id_fkey FOREIGN KEY (group_id) REFERENCES s1.groups(id) ON DELETE CASCADE;


--
-- Name: keyword_logs keyword_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.keyword_logs ADD CONSTRAINT keyword_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: message_gifts message_gifts_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_gifts
    ADD CONSTRAINT message_gifts_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_gifts message_gifts_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.message_gifts ADD CONSTRAINT message_gifts_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: message_gifts message_gifts_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.message_gifts ADD CONSTRAINT message_gifts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES s1.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES s1.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: post_views post_views_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.post_views ADD CONSTRAINT post_views_post_id_fkey FOREIGN KEY (post_id) REFERENCES s1.posts(id) ON DELETE CASCADE;


--
-- Name: post_views post_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.post_views ADD CONSTRAINT post_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: spam_detection_logs spam_detection_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.spam_detection_logs ADD CONSTRAINT spam_detection_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: virtual_chat_messages virtual_chat_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.virtual_chat_messages ADD CONSTRAINT virtual_chat_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES s1.profiles(id);


--
-- Name: virtual_chat_messages virtual_chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

-- [migrated-out FK removed] ALTER TABLE ONLY public.virtual_chat_messages ADD CONSTRAINT virtual_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES s1.profiles(id);


--
-- Name: virtual_chat_messages Admin can see all virtual messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can see all virtual messages" ON public.virtual_chat_messages FOR SELECT USING (true);


--
-- Name: virtual_chat_messages Anyone can insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert messages" ON public.virtual_chat_messages FOR INSERT WITH CHECK (true);


--
-- Name: notifications Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications System can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_events admin read events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin read events" ON public.engagement_events FOR SELECT TO authenticated USING (public.is_active_bangchu(auth.uid()));


--
-- Name: messages admin_reply_as_virtual_clone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reply_as_virtual_clone ON public.messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = messages.sender_id) AND (p.is_virtual OR p.is_clone OR p.is_seed_account)))) AND public.has_role(auth.uid(), 'admin'::text)));


--
-- Name: keyword_logs admins read keyword logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read keyword logs" ON public.keyword_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));


--
-- Name: messages block_level3_no_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY block_level3_no_delete ON public.messages AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_hard_banned(auth.uid())));


--
-- Name: notifications block_level3_no_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY block_level3_no_delete ON public.notifications AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_hard_banned(auth.uid())));


--
-- Name: messages block_level3_no_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY block_level3_no_insert ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


--
-- Name: notifications block_level3_no_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY block_level3_no_insert ON public.notifications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


--
-- Name: messages block_level3_no_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY block_level3_no_update ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_hard_banned(auth.uid()))) WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


--
-- Name: notifications block_level3_no_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY block_level3_no_update ON public.notifications AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_hard_banned(auth.uid()))) WITH CHECK ((NOT public.is_hard_banned(auth.uid())));


--
-- Name: chat_group_messages cgmsg_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cgmsg_delete_own ON public.chat_group_messages FOR DELETE TO authenticated USING ((sender_id = auth.uid()));


--
-- Name: chat_group_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_partners ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_clears conv_clears_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conv_clears_delete_own ON public.conversation_clears FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: conversation_clears conv_clears_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conv_clears_insert_own ON public.conversation_clears FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: conversation_clears conv_clears_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conv_clears_select_own ON public.conversation_clears FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: conversation_clears conv_clears_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conv_clears_update_own ON public.conversation_clears FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: conversation_clears; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_clears ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_points_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_points_log ENABLE ROW LEVEL SECURITY;

--
-- Name: group_leave_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_leave_log ENABLE ROW LEVEL SECURITY;

--
-- Name: group_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: group_messages group_messages_insert_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_messages_insert_member ON public.group_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND public.is_group_member(group_id, auth.uid()) AND (public.is_group_owner(group_id, auth.uid()) OR (NOT (EXISTS ( SELECT 1
   FROM s1.groups g
  WHERE ((g.id = group_messages.group_id) AND (g.is_muted = true))))))));


--
-- Name: group_messages group_messages_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_messages_select_member ON public.group_messages FOR SELECT TO authenticated USING ((public.is_group_member(group_id, auth.uid()) AND (is_archived = false)));


--
-- Name: group_stats_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_stats_log ENABLE ROW LEVEL SECURITY;

--
-- Name: group_stats_log group_stats_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_stats_select_member ON public.group_stats_log FOR SELECT TO authenticated USING (public.is_group_member(group_id, auth.uid()));


--
-- Name: keyword_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: keyword_logs keyword_logs_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY keyword_logs_admin_read ON public.keyword_logs FOR SELECT TO authenticated USING (public.is_current_user_admin());


--
-- Name: keyword_logs klog_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY klog_admin_select ON public.keyword_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));


--
-- Name: keyword_logs klog_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY klog_self_insert ON public.keyword_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: member_activity_log mal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mal_read ON public.member_activity_log FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.is_admin, false))))));


--
-- Name: member_activity_log mal_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mal_self_insert ON public.member_activity_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: member_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: message_gifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_gifts ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages participants read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "messages participants read" ON public.messages FOR SELECT TO authenticated USING (((sender_id = auth.uid()) OR (receiver_id = auth.uid())));


--
-- Name: messages messages sender insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "messages sender insert" ON public.messages FOR INSERT TO authenticated WITH CHECK ((sender_id = auth.uid()));


--
-- Name: messages messages_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert_own ON public.messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: messages messages_insert_self_or_virtual; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert_self_or_virtual ON public.messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) OR (EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = messages.sender_id) AND (p.is_virtual = true)))) OR (EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_admin = true) OR (p.role = 'admin'::text)))))));


--
-- Name: messages messages_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select_own ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: messages messages_select_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select_self_or_admin ON public.messages FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR (EXISTS ( SELECT 1
   FROM s1.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_admin = true) OR (p.role = 'admin'::text)))))));


--
-- Name: messages messages_update_receiver; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_update_receiver ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id));


--
-- Name: message_gifts msg_gifts_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msg_gifts_select_own ON public.message_gifts FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: engagement_points_log no client insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "no client insert" ON public.engagement_points_log FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: notifications notif_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_delete_own ON public.notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: notifications notif_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_insert_self ON public.notifications FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications notif_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_select_own ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications notif_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_update_own ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_logs own activity insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own activity insert" ON public.activity_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: activity_logs own activity read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own activity read" ON public.activity_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_partners own chat partners delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat partners delete" ON public.chat_partners FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: chat_partners own chat partners insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat partners insert" ON public.chat_partners FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_partners own chat partners select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat partners select" ON public.chat_partners FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: chat_partners own chat partners update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat partners update" ON public.chat_partners FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: post_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

--
-- Name: post_views post_views_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_views_insert_self ON public.post_views FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: post_views post_views_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_views_select_all ON public.post_views FOR SELECT TO authenticated USING (true);


--
-- Name: rate_limit_hits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_hits rate_limit_hits_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_limit_hits_self_insert ON public.rate_limit_hits FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: rate_limit_hits rate_limit_hits_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_limit_hits_self_select ON public.rate_limit_hits FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: message_reactions reactions_delete_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reactions_delete_self ON public.message_reactions FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: message_reactions reactions_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reactions_insert_self ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.can_view_message(message_id)));


--
-- Name: message_reactions reactions_select_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reactions_select_participants ON public.message_reactions FOR SELECT TO authenticated USING (public.can_view_message(message_id));


--
-- Name: message_reactions reactions_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reactions_update_self ON public.message_reactions FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: messages sender can update own message; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sender can update own message" ON public.messages FOR UPDATE TO authenticated USING ((auth.uid() = sender_id)) WITH CHECK ((auth.uid() = sender_id));


--
-- Name: spam_detection_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spam_detection_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: spam_detection_logs spam_detection_logs admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "spam_detection_logs admin read" ON public.spam_detection_logs FOR SELECT USING ((public.has_bot_role(auth.uid(), 'admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'super_admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'bot_manager'::public.bot_role) OR public.has_bot_role(auth.uid(), 'moderator'::public.bot_role) OR public.has_bot_role(auth.uid(), 'reviewer'::public.bot_role)));


--
-- Name: spam_detection_logs spam_detection_logs admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "spam_detection_logs admin write" ON public.spam_detection_logs USING ((public.has_bot_role(auth.uid(), 'admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'super_admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'bot_manager'::public.bot_role))) WITH CHECK ((public.has_bot_role(auth.uid(), 'admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'super_admin'::public.bot_role) OR public.has_bot_role(auth.uid(), 'bot_manager'::public.bot_role)));


--
-- Name: engagement_points_log users read own points log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users read own points log" ON public.engagement_points_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: virtual_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.virtual_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--





-- ---------------------------------------------------------------------------
-- 4. Trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bump_post_views_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE s1.posts SET views_count = views_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE s1.posts SET views_count = GREATEST(views_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public._trg_restrict_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
BEGIN
  PERFORM public.enforce_restriction('message');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_messages_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
declare v_active integer;
begin
  update s1.groups
     set message_count   = message_count + 1,
         last_message_at = new.created_at
   where id = new.group_id;

  select count(*) into v_active
    from public.group_messages
   where group_id = new.group_id and is_archived = false;

  if v_active > 30 then
    update public.group_messages
       set is_archived = true, archived_at = now()
     where id in (
       select id from public.group_messages
        where group_id = new.group_id and is_archived = false
        order by created_at asc
        limit (v_active - 30)
     );
  end if;
  return new;
end$function$;

CREATE OR REPLACE FUNCTION public.guard_pending_gift_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF COALESCE(OLD.data->>'kind', '') = 'gift_v1'
     AND COALESCE(OLD.data->>'status', 'pending') = 'pending' THEN
    RAISE EXCEPTION 'PENDING_GIFT_NOTIFICATION_LOCKED';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_interaction_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    points_to_add INT := 0;
    user_id_to_reward UUID;
BEGIN
    -- Xác định số điểm dựa trên tên bảng kích hoạt trigger
    IF TG_TABLE_NAME = 'likes' THEN
        points_to_add := 50;
        user_id_to_reward := NEW.user_id;
    ELSIF TG_TABLE_NAME = 'comments' THEN
        points_to_add := 100;
        user_id_to_reward := NEW.user_id;
    ELSIF TG_TABLE_NAME = 'messages' THEN
        points_to_add := 20;
        user_id_to_reward := NEW.sender_id;
    ELSIF TG_TABLE_NAME = 'nearby_scans' THEN
        points_to_add := 150;
        user_id_to_reward := NEW.user_id;
    END IF;

    -- Thực hiện cộng điểm cho người dùng
    IF user_id_to_reward IS NOT NULL AND points_to_add > 0 THEN
        UPDATE s1.profiles
        SET interaction_points = interaction_points + points_to_add
        WHERE id = user_id_to_reward;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_aggregate_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
DECLARE
  v_key text := public.notif_real_dedup_key(NEW.type, coalesce(NEW.data, '{}'::jsonb));
  v_actor text := nullif(coalesce(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id', NEW.data->>'from_user_id', NEW.data->>'user_id'), '');
  v_actor_name text := coalesce(NEW.data->>'actor_name', NEW.data->>'sender_name');
  v_actor_avatar text := coalesce(NEW.data->>'actor_avatar', NEW.data->>'sender_avatar');
  v_existing_id uuid;
  v_existing_data jsonb;
  v_actors jsonb;
  v_already boolean := false;
BEGIN
  IF lower(coalesce(NEW.type, '')) NOT IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like') THEN
    RETURN NEW;
  END IF;

  IF v_key IS NULL OR v_actor IS NULL THEN
    NEW.dedup_key := v_key;
    RETURN NEW;
  END IF;

  NEW.dedup_key := v_key;

  SELECT id, data INTO v_existing_id, v_existing_data
    FROM public.notifications
   WHERE user_id = NEW.user_id
     AND type = NEW.type
     AND dedup_key = v_key
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_actors := coalesce(v_existing_data->'actors', '[]'::jsonb);
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_actors) e WHERE e->>'id' = v_actor)
    INTO v_already;

  IF NOT v_already THEN
    v_actors := v_actors || jsonb_build_object(
      'id', v_actor,
      'name', v_actor_name,
      'avatar', v_actor_avatar,
      'at', now()
    );
  END IF;

  UPDATE public.notifications
     SET data = coalesce(data, '{}'::jsonb)
                || coalesce(NEW.data, '{}'::jsonb)
                || jsonb_build_object(
                     'actors', v_actors,
                     'aggregated', true,
                     'last_actor_id', v_actor,
                     'last_actor_name', v_actor_name,
                     'last_actor_avatar', v_actor_avatar,
                     'count', jsonb_array_length(v_actors)
                   ),
         is_read = false,
         created_at = now(),
         dedup_key = v_key
   WHERE id = v_existing_id;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_dedup_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
DECLARE
  v_comment_id  text := nullif(coalesce(NEW.data->>'comment_id', NEW.data->>'reply_id', NEW.data->>'target_comment_id'), '');
  v_post_id     text := nullif(coalesce(NEW.data->>'post_id', NEW.data->>'target_id', NEW.data->>'target_post_id', NEW.data->>'video_id', NEW.data->>'target_video_id'), '');
  v_actor       text := nullif(coalesce(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id', NEW.data->>'from_user_id', NEW.data->>'commenter_id'), '');
  v_has_avatar  boolean := coalesce(nullif(NEW.data->>'actor_avatar',''), nullif(NEW.data->>'sender_avatar','')) IS NOT NULL;
  v_existing_id uuid;
  v_existing_data jsonb;
BEGIN
  IF lower(coalesce(NEW.type, '')) NOT IN (
    'comment_post','comment_video','comment','reply','comment_reply',
    'post_comment','video_comment','new_comment'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT n.id, n.data INTO v_existing_id, v_existing_data
    FROM public.notifications n
   WHERE n.user_id = NEW.user_id
     AND n.type = NEW.type
     AND n.created_at > now() - interval '10 minutes'
     AND (
       (v_comment_id IS NOT NULL AND nullif(coalesce(n.data->>'comment_id', n.data->>'reply_id', n.data->>'target_comment_id'), '') = v_comment_id)
       OR (
         v_comment_id IS NULL
         AND v_post_id IS NOT NULL
         AND v_actor IS NOT NULL
         AND nullif(coalesce(n.data->>'post_id', n.data->>'target_id', n.data->>'target_post_id', n.data->>'video_id', n.data->>'target_video_id'), '') = v_post_id
         AND nullif(coalesce(n.data->>'sender_id', n.data->>'actor_id', n.data->>'from_id', n.data->>'from_user_id', n.data->>'commenter_id'), '') = v_actor
       )
     )
   ORDER BY n.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_existing_id IS NULL THEN RETURN NEW; END IF;

  IF v_has_avatar AND coalesce(nullif(v_existing_data->>'actor_avatar',''), nullif(v_existing_data->>'sender_avatar','')) IS NULL THEN
    UPDATE public.notifications
       SET data = coalesce(data, '{}'::jsonb) || coalesce(NEW.data, '{}'::jsonb),
           is_read = false,
           created_at = now(),
           dedup_key = public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb) || coalesce(NEW.data, '{}'::jsonb))
     WHERE id = v_existing_id;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_prepare_dedup_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
BEGIN
  NEW.dedup_key := public.notif_real_dedup_key(NEW.type, coalesce(NEW.data, '{}'::jsonb));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_sync_content()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.message IS NULL AND NEW.content IS NOT NULL THEN
    NEW.message := NEW.content;
  ELSIF NEW.content IS NULL AND NEW.message IS NOT NULL THEN
    NEW.content := NEW.message;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.notify_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
      declare v_actor text; v_excerpt text;
      begin
        if new.sender_id = new.receiver_id then return new; end if;
        v_actor := public.notif_actor_name(new.sender_id);
        v_excerpt := left(coalesce(new.content, '[ảnh]'), 80);
        insert into public.notifications (user_id, type, title, message, data)
        values (new.receiver_id, 'message',
                v_actor, v_excerpt,
                jsonb_build_object('sender_id', new.sender_id,
                                   'sender_name', v_actor,
                                   'message_id', new.id));
        return new;
      end $function$;

CREATE OR REPLACE FUNCTION public.protect_pending_dragon_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
BEGIN
  IF OLD.type IN ('gift_post', 'dragon_reward')
     AND COALESCE((OLD.data->>'claimed')::boolean, false) = false
     AND COALESCE(OLD.data->>'status', 'pending') = 'pending'
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Pending rewards must be claimed before deletion';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remember_chat_partners()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 's1'
AS $function$
BEGIN
  IF NEW.sender_id IS NOT NULL AND NEW.receiver_id IS NOT NULL
     AND NEW.sender_id <> NEW.receiver_id THEN
    INSERT INTO public.chat_partners (user_id, partner_id)
    VALUES (NEW.sender_id, NEW.receiver_id), (NEW.receiver_id, NEW.sender_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_message_reactions_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Quyen truy cap Data API
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT ON public.messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
GRANT SELECT ON public.message_reactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_gifts TO authenticated;
GRANT ALL ON public.message_gifts TO service_role;
GRANT SELECT ON public.message_gifts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_partners TO authenticated;
GRANT ALL ON public.chat_partners TO service_role;
GRANT SELECT ON public.chat_partners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_clears TO authenticated;
GRANT ALL ON public.conversation_clears TO service_role;
GRANT SELECT ON public.conversation_clears TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
GRANT SELECT ON public.group_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_messages TO authenticated;
GRANT ALL ON public.chat_group_messages TO service_role;
GRANT SELECT ON public.chat_group_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.virtual_chat_messages TO authenticated;
GRANT ALL ON public.virtual_chat_messages TO service_role;
GRANT SELECT ON public.virtual_chat_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_views TO authenticated;
GRANT ALL ON public.post_views TO service_role;
GRANT SELECT ON public.post_views TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
GRANT SELECT ON public.activity_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_points_log TO authenticated;
GRANT ALL ON public.engagement_points_log TO service_role;
GRANT SELECT ON public.engagement_points_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_events TO authenticated;
GRANT ALL ON public.engagement_events TO service_role;
GRANT SELECT ON public.engagement_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
GRANT SELECT ON public.rate_limit_hits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyword_logs TO authenticated;
GRANT ALL ON public.keyword_logs TO service_role;
GRANT SELECT ON public.keyword_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_activity_log TO authenticated;
GRANT ALL ON public.member_activity_log TO service_role;
GRANT SELECT ON public.member_activity_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_leave_log TO authenticated;
GRANT ALL ON public.group_leave_log TO service_role;
GRANT SELECT ON public.group_leave_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_stats_log TO authenticated;
GRANT ALL ON public.group_stats_log TO service_role;
GRANT SELECT ON public.group_stats_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spam_detection_logs TO authenticated;
GRANT ALL ON public.spam_detection_logs TO service_role;
GRANT SELECT ON public.spam_detection_logs TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['messages','notifications','message_reactions','group_messages','chat_partners'] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

