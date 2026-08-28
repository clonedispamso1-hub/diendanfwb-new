import { useEffect, useState } from "react";
import { sb4 } from "@/lib/supabase-v4";

/**
 * Số đơn tố cáo `status = 'pending'` trong bảng `reports` (Supabase #4).
 * Poll nhẹ 20s/lần — dùng cho badge đỏ ở sidebar Admin.
 */
export function useSb4PendingReports(intervalMs = 20000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { count: c } = await sb4()
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        if (alive) setCount(c ?? 0);
      } catch {
        if (alive) setCount(0);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), intervalMs);
    return () => { alive = false; window.clearInterval(t); };
  }, [intervalMs]);

  return count;
}
