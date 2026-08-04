-- Chạy thủ công trên DB cũ (zbuwddjcqdlyijcunwgd) qua SQL Editor.
-- Thêm cột description để hiển thị mô tả hành vi trực tiếp ra UI.
alter table public.activity_logs
  add column if not exists description text;

create index if not exists activity_logs_action_idx
  on public.activity_logs(action_type);