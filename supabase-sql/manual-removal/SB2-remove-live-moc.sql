-- RUN ONLY in SB2: pymwwuscoftmdcmmeckp
-- Removes retired Live Mốc tables and dependent policies/indexes.
-- community_page and all storage buckets remain untouched.
begin;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_moc_rooms') then
    execute 'alter publication supabase_realtime drop table public.live_moc_rooms';
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_moc_settings') then
    execute 'alter publication supabase_realtime drop table public.live_moc_settings';
  end if;
end $$;
drop table if exists public.live_moc_rooms cascade;
drop table if exists public.live_moc_settings cascade;
commit;
