-- =====================================================================
-- Chạy trên Supabase #2 (Media Storage) — SQL Editor.
-- Tạo bucket PUBLIC "feedback-media" để chứa ảnh Feedback (WebP).
-- Không dùng Cloudinary. Không ảnh hưởng bucket khác.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-media', 'feedback-media', true, 5242880, ARRAY['image/webp','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ai cũng xem được (bucket public, ảnh phục vụ blog Feedback)
DROP POLICY IF EXISTS feedback_media_read ON storage.objects;
CREATE POLICY feedback_media_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'feedback-media');

-- Upload/ghi đè/xoá: chỉ từ client anon của app (DB2 không có auth) —
-- giới hạn bằng prefix thư mục "fb/".
DROP POLICY IF EXISTS feedback_media_write ON storage.objects;
CREATE POLICY feedback_media_write ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'feedback-media' AND (storage.foldername(name))[1] = 'fb');

DROP POLICY IF EXISTS feedback_media_delete ON storage.objects;
CREATE POLICY feedback_media_delete ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'feedback-media' AND (storage.foldername(name))[1] = 'fb');
