-- Thêm hỗ trợ Chỉnh sửa & Thu hồi tin nhắn (Messenger-style).
-- Chạy trên DB Supabase hiện có (dùng lại DB cũ).

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists is_recalled boolean not null default false,
  add column if not exists recalled_at timestamptz;

-- Bật realtime UPDATE cho messages (bỏ qua nếu đã bật).
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.messages';
  exception when others then null;
  end;
end $$;

-- Sender được UPDATE tin nhắn của chính mình (edit + recall).
drop policy if exists "sender can update own message" on public.messages;
create policy "sender can update own message"
on public.messages
for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);
