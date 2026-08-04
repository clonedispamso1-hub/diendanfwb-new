-- =====================================================================
-- HOTFIX 2026-07-29
--   1) keyword_logs: bổ sung cột thiếu (content, context_type, severity,
--      ip_address, device, username) — an toàn khi chạy lại.
--   2) RPC admin_add_keyword / admin_delete_keyword / admin_update_keyword
--      (Bot Từ khoá) + moderate_content dùng chung cho Đăng bài / Bình luận
--      / Tin nhắn.  Không lộ danh sách từ cấm.
--   3) admin_moderation_stats: thống kê 30 ngày.
--   4) admin_factory_reset_data: xoá dữ liệu người dùng nhưng GIỮ NGUYÊN
--      bảng / RPC / function / trigger / schema.
--   5) admin_export_all_data / admin_import_all_data: dùng cho Backup /
--      Restore (client mã hoá blob rồi tải xuống).
--   6) posts.pinned_at: cột phụ để sắp xếp bài ghim theo thời gian ghim.
--
-- Chạy 1 lần trong SQL Editor. Idempotent.
-- =====================================================================

-- 1) keyword_logs bổ sung cột thiếu -----------------------------------
CREATE TABLE IF NOT EXISTS public.keyword_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  matched_keyword TEXT NOT NULL,
  penalty INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.keyword_logs
  ADD COLUMN IF NOT EXISTS content       TEXT,
  ADD COLUMN IF NOT EXISTS context_type  TEXT,
  ADD COLUMN IF NOT EXISTS severity      TEXT,
  ADD COLUMN IF NOT EXISTS username      TEXT,
  ADD COLUMN IF NOT EXISTS ip_address    TEXT,
  ADD COLUMN IF NOT EXISTS device        TEXT;

GRANT SELECT, INSERT ON public.keyword_logs TO authenticated;
GRANT ALL           ON public.keyword_logs TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'keyword_logs_id_seq') THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.keyword_logs_id_seq TO authenticated';
  END IF;
END $$;

ALTER TABLE public.keyword_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "klog_admin_select" ON public.keyword_logs;
CREATE POLICY "klog_admin_select" ON public.keyword_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
DROP POLICY IF EXISTS "klog_self_insert" ON public.keyword_logs;
CREATE POLICY "klog_self_insert" ON public.keyword_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 2) banned_keywords bảo đảm tồn tại ----------------------------------
CREATE TABLE IF NOT EXISTS public.banned_keywords (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  normalized TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  penalty INT NOT NULL DEFAULT 15,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Helper chuẩn hoá text (bỏ dấu TV + lowercase + strip)
CREATE OR REPLACE FUNCTION public._norm_text(_s TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    translate(
      lower(COALESCE(_s, '')),
      'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '[^a-z0-9]', '', 'g'
  );
$$;

-- 4) admin_add / delete / update keyword ------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_keyword(
  _keyword TEXT, _severity TEXT DEFAULT 'medium', _penalty INT DEFAULT 15
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_admin BOOLEAN; v_id BIGINT; v_norm TEXT;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_norm := public._norm_text(_keyword);
  IF v_norm = '' THEN RAISE EXCEPTION 'Từ khoá không hợp lệ'; END IF;

  INSERT INTO public.banned_keywords (keyword, normalized, severity, penalty, created_by)
  VALUES (_keyword, v_norm, COALESCE(_severity,'medium'), COALESCE(_penalty,15), auth.uid())
  ON CONFLICT (keyword) DO UPDATE
    SET normalized = EXCLUDED.normalized,
        severity   = EXCLUDED.severity,
        penalty    = EXCLUDED.penalty
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_add_keyword(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_keyword(TEXT, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_keyword(_id BIGINT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM public.banned_keywords WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_keyword(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_keyword(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_keyword(_id BIGINT, _penalty INT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_admin BOOLEAN;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.banned_keywords SET penalty = COALESCE(_penalty, penalty) WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_keyword(BIGINT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_keyword(BIGINT, INT) TO authenticated;

-- 5) moderate_content — DÙNG CHUNG cho post/comment/message -----------
CREATE OR REPLACE FUNCTION public.moderate_content(
  _content TEXT, _kind TEXT DEFAULT 'post', _device TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_norm  TEXT;
  v_match TEXT;
  v_pen   INT;
  v_sev   TEXT;
  v_name  TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;
  v_norm := public._norm_text(_content);
  IF v_norm = '' THEN RETURN jsonb_build_object('blocked', false); END IF;

  SELECT keyword, penalty, severity
    INTO v_match, v_pen, v_sev
    FROM public.banned_keywords
   WHERE normalized <> '' AND position(normalized IN v_norm) > 0
   ORDER BY penalty DESC LIMIT 1;

  IF v_match IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;

  SELECT username INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.keyword_logs
    (user_id, username, content, matched_keyword, penalty, context_type, severity, device)
  VALUES
    (v_uid, v_name, _content, v_match, COALESCE(v_pen,15),
     COALESCE(_kind,'post'), COALESCE(v_sev,'medium'), _device);

  UPDATE public.profiles
     SET reputation_score = GREATEST(0, COALESCE(reputation_score,100) - COALESCE(v_pen,15))
   WHERE id = v_uid;

  RETURN jsonb_build_object('blocked', true);
END $$;
REVOKE ALL ON FUNCTION public.moderate_content(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_content(TEXT, TEXT, TEXT) TO authenticated;

-- 6) admin_moderation_stats -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_moderation_stats(_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_admin BOOLEAN; v_out JSONB; v_since TIMESTAMPTZ;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_since := now() - make_interval(days => COALESCE(_days,30));

  SELECT jsonb_build_object(
    'total',       (SELECT COUNT(*) FROM public.keyword_logs WHERE created_at >= v_since),
    'total_all',   (SELECT COUNT(*) FROM public.keyword_logs),
    'critical',    (SELECT COUNT(*) FROM public.keyword_logs WHERE severity IN ('high','critical') AND created_at >= v_since),
    'by_type',     (SELECT COALESCE(jsonb_object_agg(context_type, c), '{}'::jsonb)
                      FROM (SELECT COALESCE(context_type,'post') context_type, COUNT(*) c
                              FROM public.keyword_logs WHERE created_at >= v_since
                             GROUP BY 1) t),
    'top_keywords',(SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword', matched_keyword, 'count', c)), '[]'::jsonb)
                      FROM (SELECT matched_keyword, COUNT(*) c
                              FROM public.keyword_logs WHERE created_at >= v_since
                             GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t),
    'top_users',   (SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'username', username, 'count', c)), '[]'::jsonb)
                      FROM (SELECT user_id, MAX(username) username, COUNT(*) c
                              FROM public.keyword_logs WHERE created_at >= v_since
                             GROUP BY user_id ORDER BY 3 DESC LIMIT 10) t)
  ) INTO v_out;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.admin_moderation_stats(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_moderation_stats(INT) TO authenticated;

-- 7) posts.pinned_at cho sắp xếp bài ghim theo thời gian ghim ---------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Trigger: khi is_pinned bật lên true → cập nhật pinned_at = now().
CREATE OR REPLACE FUNCTION public._posts_pinned_at_touch() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.is_pinned,false) = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_pinned,false) = false) THEN
    NEW.pinned_at := now();
  ELSIF COALESCE(NEW.is_pinned,false) = false THEN
    NEW.pinned_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_posts_pinned_at ON public.posts;
CREATE TRIGGER trg_posts_pinned_at
  BEFORE INSERT OR UPDATE OF is_pinned ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public._posts_pinned_at_touch();

-- Backfill cho các bài ghim hiện có.
UPDATE public.posts SET pinned_at = COALESCE(pinned_at, created_at)
 WHERE is_pinned = true AND pinned_at IS NULL;

-- 8) admin_factory_reset_data — xoá dữ liệu, GIỮ schema ---------------
-- Xoá dữ liệu ở các bảng liệt kê. KHÔNG DROP bảng, KHÔNG đụng RPC/trigger.
CREATE OR REPLACE FUNCTION public.admin_factory_reset_data() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin BOOLEAN;
  t TEXT;
  v_cleared TEXT[] := ARRAY[]::TEXT[];
  v_tables TEXT[] := ARRAY[
    'notifications','messages','conversation_clears','message_reactions',
    'comment_likes','comments','likes','post_reports','user_reports',
    'follows','blocks','gems','gem_transactions','red_packets','red_packet_claims',
    'keyword_logs','audit_logs','dice_logs','leaderboard_daily',
    'posts','profiles'
  ];
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      -- Không xoá admin hiện tại khỏi profiles để còn quản trị.
      IF t = 'profiles' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id <> %L', t, auth.uid());
      ELSE
        EXECUTE format('DELETE FROM public.%I', t);
      END IF;
      v_cleared := array_append(v_cleared, t);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('cleared', to_jsonb(v_cleared));
END $$;
REVOKE ALL ON FUNCTION public.admin_factory_reset_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_factory_reset_data() TO authenticated;

-- 9) admin_export_all_data / admin_import_all_data ---------------------
-- Export: trả về JSONB gồm mọi bảng dữ liệu người dùng. Client sẽ mã hoá
-- rồi tải file .bin về máy.
CREATE OR REPLACE FUNCTION public.admin_export_all_data() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin BOOLEAN;
  t TEXT;
  v_out JSONB := '{}'::jsonb;
  v_rows JSONB;
  v_tables TEXT[] := ARRAY[
    'profiles','posts','comments','comment_likes','likes',
    'messages','conversation_clears','message_reactions',
    'notifications','follows','blocks','user_reports','post_reports',
    'gems','gem_transactions','red_packets','red_packet_claims',
    'banned_keywords','keyword_logs','audit_logs',
    'dice_logs','leaderboard_daily','user_restrictions'
  ];
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x', t)
        INTO v_rows;
      v_out := v_out || jsonb_build_object(t, v_rows);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'exported_at', now(),
    'exported_by', auth.uid(),
    'tables', v_out
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_export_all_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_export_all_data() TO authenticated;

-- Import: nhận payload JSON tương ứng và ghi đè. UID (id) giữ nguyên.
-- Mật khẩu / SĐT nằm ở schema auth.users — không đụng để đảm bảo user
-- vẫn đăng nhập được bằng SĐT+mật khẩu cũ.
CREATE OR REPLACE FUNCTION public.admin_import_all_data(_payload JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_tables JSONB;
  t TEXT;
  v_restored TEXT[] := ARRAY[]::TEXT[];
  v_order TEXT[] := ARRAY[
    'profiles','posts','comments','comment_likes','likes',
    'messages','conversation_clears','message_reactions',
    'notifications','follows','blocks','user_reports','post_reports',
    'gems','gem_transactions','red_packets','red_packet_claims',
    'banned_keywords','keyword_logs','audit_logs',
    'dice_logs','leaderboard_daily','user_restrictions'
  ];
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  v_tables := COALESCE(_payload->'tables', _payload);

  -- Xoá trước (giống factory reset nhưng KHÔNG đụng admin hiện tại).
  PERFORM public.admin_factory_reset_data();

  FOREACH t IN ARRAY v_order LOOP
    IF (v_tables ? t)
       AND EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name = t) THEN
      -- Chèn theo hàng, bỏ hàng lỗi (VD: FK profile chưa có).
      BEGIN
        EXECUTE format(
          'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1) ON CONFLICT DO NOTHING',
          t, t
        ) USING (v_tables->t);
        v_restored := array_append(v_restored, t);
      EXCEPTION WHEN OTHERS THEN
        -- Bỏ qua bảng lỗi, tiếp tục.
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('restored', to_jsonb(v_restored));
END $$;
REVOKE ALL ON FUNCTION public.admin_import_all_data(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_all_data(JSONB) TO authenticated;
