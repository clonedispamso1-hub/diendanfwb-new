import { useCallback, useEffect, useState } from "react";
import { fetchPendingCounts } from "@/services/reports-v2.service";
import { useRealtime } from "@/lib/realtime-registry";

/** Total pending reports in public.reports (all report_type values). */
export function usePendingReportsCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const c = await fetchPendingCounts();
      setCount(c.total);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useRealtime(
    "pending-reports-count-v2",
    [{ table: "reports", event: "*" }],
    () => void load(),
  );

  return count;
}

export function formatBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
