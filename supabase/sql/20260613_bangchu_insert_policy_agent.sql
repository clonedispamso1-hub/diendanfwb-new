-- =====================================================================
-- Patch: cho phép self-register với role='agent' (mặc định mới)
-- Chạy 1 lần trong Supabase SQL Editor.
-- =====================================================================
drop policy if exists "self register pending" on public.bangchu;

create policy "self register pending" on public.bangchu for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and status    = 'pending'
    and is_active = false
    and role      = 'agent'
  );
