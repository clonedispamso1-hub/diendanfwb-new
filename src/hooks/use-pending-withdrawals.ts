import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/lib/realtime-registry";
import { isUuid } from "@/lib/uuid";

export type PendingWithdrawal = {
  id: string;
  code: string;
  user_id: string;
  amount: number;
  created_at: string;
  full_name?: string | null;
};

/** Số yêu cầu rút tiền đang chờ duyệt (realtime cho Admin Panel). */
export function usePendingWithdrawals() {
  const [items, setItems] = useState<PendingWithdrawal[]>([]);

  const load = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).rpc("admin_list_withdrawal_requests", {
        p_status: "pending",
      });
      if (error) throw error;
      const rows: PendingWithdrawal[] = (data || []).slice(0, 20);
      // Lọc UUID hợp lệ trước khi query profiles.id (uuid) — tránh lỗi 42883.
      const ids = Array.from(new Set(rows.map((r) => r.user_id))).filter(isUuid);
      if (ids.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        const map: Record<string, string | null> = {};
        (profs || []).forEach((p: any) => { map[p.id] = p.full_name; });
        rows.forEach((r) => { r.full_name = map[r.user_id] ?? null; });
      }
      setItems(rows);
    } catch {
      /* im lặng: tài khoản không đủ quyền */
    }
  }, []);

  useEffect(() => {
    void load();
    // KHÔNG polling ngầm. Chỉ nạp lại khi admin quay lại tab (on-demand),
    // và tối đa 1 lần / 60s để không ngốn egress.
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useRealtime(
    "admin-withdrawals-pending",
    [{ table: "withdrawal_requests", event: "*" }],
    () => void load(),
  );

  return { items, count: items.length, reload: load };
}
