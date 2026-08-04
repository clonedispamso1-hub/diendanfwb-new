-- =========================================================
-- Featured Moments: hỗ trợ video (<=15s) ngoài ảnh
-- Chạy trên DB cũ: zbuwddjcqdlyijcunwgd (SQL Editor Supabase)
-- =========================================================

alter table public.featured_moments
  add column if not exists media_type text not null default 'image'
    check (media_type in ('image','video')),
  add column if not exists duration_seconds numeric;
