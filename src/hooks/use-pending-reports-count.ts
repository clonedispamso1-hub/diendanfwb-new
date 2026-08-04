import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPendingCounts } from "@/services/reports-v2.service";

/** Total pending reports in public.reports (all report_type values). */
export function usePendingReportsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const c = await fetchPendingCounts();
        if (!cancelled) setCount(c.total);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    void load();

    const ch = supabase
      .channel("pending-reports-count-v2")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "reports" },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  return count;
}

export function formatBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
