-- KHÔNG BẮT BUỘC. Website đã chặn IP mức 3 đúng mà không cần chạy file này.
-- Mục đích: hiện bảng blocked_ips đang cho khách (anon) đọc toàn bộ danh sách IP bị cấm.
-- Chạy file này để ẩn danh sách, chỉ cho hỏi "IP X có bị cấm không".
-- SAU KHI chạy, cần báo để cập nhật server function dùng RPC ip_is_blocked_level3.
CREATE OR REPLACE FUNCTION public.ip_is_blocked_level3(p_ip text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object('blocked', true, 'level', b.level, 'until', b.expires_at)
      FROM public.blocked_ips b
     WHERE b.ip = btrim(p_ip) AND COALESCE(b.level,3) >= 3
       AND (b.expires_at IS NULL OR b.expires_at > now())
     ORDER BY b.created_at DESC LIMIT 1
  ), jsonb_build_object('blocked', false));
$$;
GRANT EXECUTE ON FUNCTION public.ip_is_blocked_level3(text) TO anon, authenticated;
-- REVOKE SELECT ON public.blocked_ips FROM anon;  -- bật dòng này sau khi code đã chuyển sang RPC
