-- READ-ONLY: liệt kê auth.users KHÔNG có public.profiles. KHÔNG xoá gì.
SELECT u.id, u.email, u.phone, u.created_at, u.last_sign_in_at,
       u.raw_user_meta_data->>'phone'    AS meta_phone,
       u.raw_user_meta_data->>'username' AS meta_username
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
 ORDER BY u.created_at DESC;
