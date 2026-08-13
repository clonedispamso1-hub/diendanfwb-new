/**
 * V6 — Cấu hình rút tiền (phí %, mức tối thiểu) + danh sách ngân hàng.
 * Config đọc từ admin_site_settings key = 'withdraw_config' (không hardcode phí).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WithdrawConfig = { fee_percent: number; min_amount: number };

export const WITHDRAW_DEFAULT: WithdrawConfig = { fee_percent: 20, min_amount: 50000 };

let cached: WithdrawConfig | null = null;

export async function fetchWithdrawConfig(): Promise<WithdrawConfig> {
  if (cached) return cached;
  try {
    const { data } = await (supabase as any)
      .from("admin_site_settings")
      .select("value")
      .eq("key", "withdraw_config")
      .maybeSingle();
    const v = data?.value ?? {};
    cached = {
      fee_percent: Number(v.fee_percent ?? WITHDRAW_DEFAULT.fee_percent),
      min_amount: Number(v.min_amount ?? WITHDRAW_DEFAULT.min_amount),
    };
  } catch {
    cached = WITHDRAW_DEFAULT;
  }
  return cached;
}

export function useWithdrawConfig(): WithdrawConfig {
  const [cfg, setCfg] = useState<WithdrawConfig>(cached ?? WITHDRAW_DEFAULT);
  useEffect(() => {
    let alive = true;
    void fetchWithdrawConfig().then((c) => { if (alive) setCfg(c); });
    return () => { alive = false; };
  }, []);
  return cfg;
}

export const VN_BANKS = [
  "Vietcombank",
  "Techcombank",
  "MB Bank",
  "VPBank",
  "ACB",
  "BIDV",
  "VietinBank",
  "Agribank",
  "Sacombank",
  "TPBank",
  "SHB",
  "HDBank",
  "VIB",
  "SeABank",
  "OCB",
  "MSB",
  "Eximbank",
  "Nam A Bank",
  "Bac A Bank",
  "LPBank",
  "PVcomBank",
  "SCB",
  "ABBank",
  "Momo",
  "ZaloPay",
  "Viettel Money",
];
