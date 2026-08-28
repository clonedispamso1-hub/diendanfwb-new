-- =====================================================================
-- BẬT REALTIME CHO XU / GEM + THÔNG BÁO
-- KHÔNG tạo bảng mới. KHÔNG đổi schema. Chỉ bật replica identity +
-- thêm bảng vào publication supabase_realtime NẾU bảng thực sự tồn tại.
--
-- ⚠️ Hệ thống dùng NHIỀU Supabase:
--   • DB1 (core , gxfxqbhxoghdhokwjpex): profiles, gem_transactions,
--     coin_transactions  → chạy PHẦN A
--   • DB3 (social, uaqsetfdciyzxpuhulux): notifications
--     → chạy PHẦN B (đây là lý do "relation public.notifications
--       does not exist" khi chạy trên DB1)
--
-- File này AN TOÀN để chạy trên cả hai: bảng nào không có sẽ được bỏ qua.
-- =====================================================================

DO $$
DECLARE
  t text;
  -- Danh sách bảng cần realtime (gộp chung; chỉ bảng tồn tại mới được xử lý)
  tables text[] := ARRAY[
    'profiles',           -- DB1: số dư xu/gem hiển thị trên UI
    'gem_transactions',   -- DB1: tặng quà / tặng xu
    'coin_transactions',  -- DB1: chuyển xu trực tiếp
    'notifications'       -- DB3: thông báo cho người nhận
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        RAISE NOTICE 'Realtime ON: public.%', t;
      EXCEPTION
        WHEN duplicate_object THEN RAISE NOTICE 'Realtime đã bật sẵn: public.%', t;
      END;
    ELSE
      RAISE NOTICE 'Bỏ qua (không tồn tại ở DB này): public.%', t;
    END IF;
  END LOOP;
END $$;

-- Kiểm tra kết quả: liệt kê bảng đang được publish realtime.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
ORDER BY tablename;
