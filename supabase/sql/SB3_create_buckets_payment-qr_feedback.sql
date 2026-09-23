-- ============================================================
-- SB3 — uaqsetfdciyzxpuhulux  (logs/stats)
-- Chạy file này TRONG SQL Editor của ĐÚNG project SB3.
-- Tạo 2 bucket mới: payment-qr (private) + feedback (public).
-- KHÔNG đụng tới bucket cũ, bảng cũ, RPC cũ, dữ liệu cũ.
-- ============================================================

-- ---------- 1. BUCKET: payment-qr (PRIVATE) ----------
-- Ảnh QR chuyển khoản. KHÔNG nén, KHÔNG public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-qr',
  'payment-qr',
  false,
  10485760, -- 10MB
  array['image/png','image/jpeg','image/jpg','image/webp']
)
on conflict (id) do nothing;

-- ---------- 2. BUCKET: feedback (PUBLIC) ----------
-- Ảnh bài Feedback. Giữ nguyên nén phía client (<50KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback',
  'feedback',
  true,
  2097152, -- 2MB (ảnh đã nén <50KB, đây chỉ là trần an toàn)
  array['image/webp','image/png','image/jpeg','image/jpg']
)
on conflict (id) do nothing;

-- ============================================================
-- POLICIES — payment-qr (private)
-- Nguyên tắc: KHÔNG có policy nào cho role `anon` => không public read.
-- ============================================================

drop policy if exists "payment_qr_insert_authenticated" on storage.objects;
create policy "payment_qr_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'payment-qr');

drop policy if exists "payment_qr_read_authenticated" on storage.objects;
create policy "payment_qr_read_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'payment-qr');

drop policy if exists "payment_qr_update_authenticated" on storage.objects;
create policy "payment_qr_update_authenticated"
on storage.objects for update to authenticated
using (bucket_id = 'payment-qr')
with check (bucket_id = 'payment-qr');

drop policy if exists "payment_qr_delete_authenticated" on storage.objects;
create policy "payment_qr_delete_authenticated"
on storage.objects for delete to authenticated
using (bucket_id = 'payment-qr');

-- ============================================================
-- POLICIES — feedback (public)
-- Đọc: mọi người (kể cả chưa đăng nhập).
-- Ghi: chỉ authenticated (Admin đang là user đã đăng nhập).
-- ============================================================

drop policy if exists "feedback_read_public" on storage.objects;
create policy "feedback_read_public"
on storage.objects for select to anon, authenticated
using (bucket_id = 'feedback');

drop policy if exists "feedback_insert_authenticated" on storage.objects;
create policy "feedback_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'feedback');

drop policy if exists "feedback_update_authenticated" on storage.objects;
create policy "feedback_update_authenticated"
on storage.objects for update to authenticated
using (bucket_id = 'feedback')
with check (bucket_id = 'feedback');

drop policy if exists "feedback_delete_authenticated" on storage.objects;
create policy "feedback_delete_authenticated"
on storage.objects for delete to authenticated
using (bucket_id = 'feedback');

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY
-- select id, public, file_size_limit from storage.buckets
--   where id in ('payment-qr','feedback');
-- ============================================================
