-- Gỡ bỏ hoàn toàn Phòng Chat Kín khỏi Supabase #4.
drop trigger if exists room_messages_fifo_trg on public.room_messages;
drop function if exists public.room_messages_fifo();
drop table if exists public.room_reactions cascade;
drop table if exists public.room_messages cascade;
drop table if exists public.room_settings cascade;
