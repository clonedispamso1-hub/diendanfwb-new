# FIX: Tách username khỏi full_name (display_name)

Chạy SQL sau trên Supabase project (SQL Editor hoặc `supabase db push` với file migration của bạn) để sửa 2 bug logic:

```sql
-- 1) Cho phép chỉnh ảnh bìa
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_url text;

-- 2) handle_new_user: TUYỆT ĐỐI không tự set full_name.
--    full_name (tên hiển thị) phải luôn bắt đầu bằng NULL, để popup
--    DisplayNameGate ép người dùng nhập tên hiển thị thật.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := NEW.raw_user_meta_data->>'username';
  v_province text := NEW.raw_user_meta_data->>'province';
  v_gender   text := NEW.raw_user_meta_data->>'gender';
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name, province, location, gender)
  VALUES (NEW.id, NEW.email, v_username, NULL, v_province, v_province, v_gender)
  ON CONFLICT (id) DO UPDATE
    SET username = COALESCE(EXCLUDED.username, public.profiles.username),
        -- full_name KHÔNG được auto-fill ở đây
        province = COALESCE(EXCLUDED.province, public.profiles.province),
        location = COALESCE(EXCLUDED.location, public.profiles.location),
        gender   = COALESCE(public.profiles.gender, EXCLUDED.gender);
  RETURN NEW;
END;
$$;

-- 3) Backfill: xóa full_name đã bị auto-set = username (bug cũ),
--    để popup nhập tên hiển thị hiện ra cho user đó ở lần login sau.
UPDATE public.profiles
   SET full_name = NULL
 WHERE full_name IS NOT NULL
   AND username  IS NOT NULL
   AND lower(btrim(full_name)) = lower(btrim(username));
```

Client-side đã được đồng bộ trong cùng commit này:
- `auth-provider.register()` không còn gửi `full_name` vào `raw_user_meta_data`.
- `needsDisplayName()` coi `full_name === username` là "chưa có tên hiển thị" → popup vẫn hiện đúng ngay cả khi migration chưa chạy.
- `EditProfileSheet` bổ sung: Khu vực, Tuổi, Giới tính (chỉ đọc), Ảnh bìa.
