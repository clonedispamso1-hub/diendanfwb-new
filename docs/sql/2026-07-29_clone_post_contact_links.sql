-- ============================================================
-- Task: Cho phép tài khoản clone đăng bài kèm Link Facebook/Zalo
-- (giống hệt bài của user thật, hiển thị chip Facebook/Zalo trong feed).
--
-- Cách làm: bổ sung 1 overload MỚI cho admin_internal_create_post với
-- 2 tham số cuối p_facebook_url + p_zalo_url. KHÔNG xoá signature cũ,
-- không đụng logic cũ ⇒ zero-regression.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_internal_create_post(
  p_account uuid,
  p_content text,
  p_image_urls text[] DEFAULT NULL,
  p_visibility text DEFAULT 'home',
  p_facebook_url text DEFAULT NULL,
  p_zalo_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_imgs text[] := coalesce(p_image_urls,'{}');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_account AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Tài khoản không hợp lệ' USING ERRCODE='P0002';
  END IF;
  IF nullif(trim(coalesce(p_content,'')),'') IS NULL AND array_length(v_imgs,1) IS NULL THEN
    RAISE EXCEPTION 'Bài viết trống' USING ERRCODE='22023';
  END IF;

  DECLARE
    v_cols text := 'user_id, content';
    v_vals text := '$1, $2';
    v_has_one  boolean := public._has_column('posts','image_url');
    v_has_many boolean := public._has_column('posts','image_urls');
  BEGIN
    IF v_has_one THEN
      v_cols := v_cols || ', image_url';
      v_vals := v_vals || ', ' || coalesce(quote_literal(v_imgs[1]), 'NULL');
    END IF;
    IF v_has_many THEN
      v_cols := v_cols || ', image_urls';
      v_vals := v_vals || ', ' ||
        CASE WHEN array_length(v_imgs,1) IS NULL THEN 'NULL'
             ELSE quote_literal(v_imgs::text) || '::text[]' END;
    END IF;
    IF public._has_column('posts','has_images') THEN
      v_cols := v_cols || ', has_images'; v_vals := v_vals || ', ' || (array_length(v_imgs,1) IS NOT NULL)::text;
    END IF;
    IF public._has_column('posts','visibility') THEN
      v_cols := v_cols || ', visibility'; v_vals := v_vals || ', ' || quote_literal(coalesce(p_visibility,'home'));
    END IF;
    IF public._has_column('posts','status') THEN
      v_cols := v_cols || ', status'; v_vals := v_vals || ', ' || quote_literal('published');
    END IF;
    IF public._has_column('posts','facebook_url') AND nullif(trim(coalesce(p_facebook_url,'')),'') IS NOT NULL THEN
      v_cols := v_cols || ', facebook_url'; v_vals := v_vals || ', ' || quote_literal(p_facebook_url);
    END IF;
    IF public._has_column('posts','zalo_url') AND nullif(trim(coalesce(p_zalo_url,'')),'') IS NOT NULL THEN
      v_cols := v_cols || ', zalo_url'; v_vals := v_vals || ', ' || quote_literal(p_zalo_url);
    END IF;

    EXECUTE 'INSERT INTO public.posts (' || v_cols || ') VALUES (' || v_vals || ') RETURNING id'
      INTO v_id USING p_account, trim(coalesce(p_content,''));
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_internal_create_post(uuid,text,text[],text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_create_post(uuid,text,text[],text,text,text) TO authenticated;
