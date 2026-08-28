-- ============================================================================
-- DỌN DỮ LIỆU TEST — SUPABASE #1 (LÕI: auth, profiles, ví, admin, clone/bot)
-- Chạy trong SQL Editor của project SB1 (gxfxqbhxoghdhokwjpex).
--
-- XOÁ: mọi tài khoản test + toàn bộ dữ liệu phát sinh của chúng.
-- GIỮ NGUYÊN:
--   • Tài khoản Admin / Bảng Chủ, Clone / Bot / Seed đang dùng (kèm ví, gem, xu)
--   • Cấu hình hệ thống (settings/config/gif library...)
--   • Schema, RPC, Trigger, Function, RLS, Policy  (script KHÔNG drop gì cả)
--
-- An toàn: chỉ DELETE dữ liệu, bỏ qua bảng/cột không tồn tại.
-- ============================================================================

begin;

-- 1) Danh sách tài khoản ĐƯỢC GIỮ ------------------------------------------
create temp table _keep_users(id uuid primary key) on commit drop;

do $$
declare
  flag text;
  txt  text;
begin
  -- Cờ boolean đánh dấu tài khoản hệ thống / clone / bot
  foreach flag in array array[
    'is_admin','is_bot','is_clone','is_virtual','is_seed','is_system',
    'is_official','bot_enabled','is_bangchu'
  ] loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name=flag) then
      execute format(
        'insert into _keep_users(id) select id from public.profiles where %I is true
         on conflict do nothing', flag);
    end if;
  end loop;

  -- Cột text phân loại tài khoản
  foreach txt in array array['account_type','user_type','role','kind','source'] loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name=txt) then
      execute format(
        'insert into _keep_users(id) select id from public.profiles
          where lower(coalesce(%I::text,'''')) in
            (''bot'',''clone'',''admin'',''virtual'',''seed'',''system'',''official'',''bangchu'')
         on conflict do nothing', txt);
    end if;
  end loop;

  -- Bảng phân quyền / seed
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='user_roles') then
    insert into _keep_users(id) select user_id from public.user_roles
      where user_id is not null on conflict do nothing;
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='bangchu') then
    begin
      insert into _keep_users(id) select user_id from public.bangchu
        where user_id is not null on conflict do nothing;
    exception when others then null; end;
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='seed_accounts') then
    begin
      insert into _keep_users(id) select user_id from public.seed_accounts
        where user_id is not null on conflict do nothing;
    exception when others then null; end;
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='bot_roles') then
    begin
      insert into _keep_users(id) select user_id from public.bot_roles
        where user_id is not null on conflict do nothing;
    exception when others then null; end;
  end if;
end $$;

-- Xem trước danh sách giữ lại (kết quả in ra ở tab Results)
select p.id, p.display_name
from public.profiles p join _keep_users k on k.id = p.id;

-- 2) Xoá dữ liệu phát sinh của tài khoản test trên MỌI bảng public ---------
do $$
declare
  r record;
  protected text[] := array[
    'user_roles','bangchu','bot_roles','seed_accounts','profiles',
    'admin_site_settings','site_settings','app_settings','system_settings',
    'gif_library','stickers','categories','schema_migrations'
  ];
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name
     and t.table_type='BASE TABLE'
    where c.table_schema='public'
      and c.udt_name = 'uuid'
      and c.column_name in (
        'user_id','owner_id','profile_id','author_id','actor_id','sender_id',
        'receiver_id','recipient_id','from_user_id','to_user_id','follower_id',
        'following_id','target_user_id','uploader_id','reporter_id','reported_user_id',
        'created_by','claimed_by','partner_id','member_id'
      )
      and c.table_name <> all (protected)
  loop
    begin
      execute format(
        'delete from public.%I t where t.%I is not null
           and not exists (select 1 from _keep_users k where k.id = t.%I)',
        r.table_name, r.column_name, r.column_name);
    exception when others then null; -- bảng bị FK/RLS chặn: bỏ qua, vòng sau dọn tiếp
    end;
  end loop;

  -- Chạy vòng 2 để dọn các bảng vướng FK ở vòng 1
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name
     and t.table_type='BASE TABLE'
    where c.table_schema='public' and c.udt_name='uuid'
      and c.column_name in ('user_id','owner_id','profile_id','sender_id','receiver_id')
      and c.table_name <> all (protected)
  loop
    begin
      execute format(
        'delete from public.%I t where t.%I is not null
           and not exists (select 1 from _keep_users k where k.id = t.%I)',
        r.table_name, r.column_name, r.column_name);
    exception when others then null; end;
  end loop;
end $$;

-- 3) Xoá profile của tài khoản test ----------------------------------------
delete from public.profiles p
where not exists (select 1 from _keep_users k where k.id = p.id);

-- 4) Xoá tài khoản auth tương ứng (để SĐT/email có thể đăng ký lại) --------
delete from auth.users u
where not exists (select 1 from _keep_users k where k.id = u.id);

commit;

-- 5) KIỂM TRA SAU KHI DỌN ---------------------------------------------------
select (select count(*) from auth.users)        as auth_users_left,
       (select count(*) from public.profiles)   as profiles_left;
