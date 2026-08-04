-- CRM khách hàng + Thu Chi (Cài đặt → CRM)
-- Chạy 1 lần trong SQL Editor của Supabase.

-- ============ 1. Bảng khách hàng ============
CREATE TABLE IF NOT EXISTS public.crm_customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE,
  name          text NOT NULL,
  phone         text,
  zalo_name     text,
  facebook_url  text,
  facebook_name text,
  region        text,
  package_price numeric NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'unpaid',  -- 'unpaid' | 'paid'
  purchased_at  timestamptz,
  approved_by   text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_customers_phone_idx  ON public.crm_customers (phone);
CREATE INDEX IF NOT EXISTS crm_customers_status_idx ON public.crm_customers (status);
CREATE INDEX IF NOT EXISTS crm_customers_created_idx ON public.crm_customers (created_at DESC);

-- Mã khách hàng tự sinh: KH000001
CREATE SEQUENCE IF NOT EXISTS public.crm_customer_code_seq START 1;

CREATE OR REPLACE FUNCTION public.crm_set_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'KH' || lpad(nextval('public.crm_customer_code_seq')::text, 6, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_customers_code_trg ON public.crm_customers;
CREATE TRIGGER crm_customers_code_trg
  BEFORE INSERT OR UPDATE ON public.crm_customers
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_code();

-- ============ 2. Bảng chi phí ============
CREATE TABLE IF NOT EXISTS public.crm_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  amount     numeric NOT NULL DEFAULT 0,
  spent_at   timestamptz NOT NULL DEFAULT now(),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_expenses_spent_idx ON public.crm_expenses (spent_at DESC);

-- ============ 3. Grants + RLS (chỉ admin) ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_expenses  TO authenticated;
GRANT ALL ON public.crm_customers TO service_role;
GRANT ALL ON public.crm_expenses  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.crm_customer_code_seq TO authenticated, service_role;

ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_expenses  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_customers_admin_all ON public.crm_customers;
CREATE POLICY crm_customers_admin_all ON public.crm_customers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)));

DROP POLICY IF EXISTS crm_expenses_admin_all ON public.crm_expenses;
CREATE POLICY crm_expenses_admin_all ON public.crm_expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false)));
