import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime-registry";

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
      const ids = Array.from(new Set(rows.map((r) => r.user_id))).filter(Boolean);
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
    // Poll chậm dự phòng (5 phút, chỉ khi tab hiển thị) — realtime đã phủ phần lớn thay đổi.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 300000);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  useRealtime(
    "admin-withdrawals-pending",
    [{ table: "withdrawal_requests", event: "*" }],
    () => void load(),
  );

  return { items, count: items.length, reload: load };
}
