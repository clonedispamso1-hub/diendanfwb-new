import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { fetchPendingCountForUser } from "@/services/reports-v2.service";

const CIRCLED: Record<number, string> = {
  1: "①",
  2: "②",
  3: "③",
  4: "④",
  5: "⑤",
  6: "⑥",
  7: "⑦",
  8: "⑧",
  9: "⑨",
  10: "⑩",
};

interface ReportBadgeProps {
  targetId: string | null | undefined;
}

/**
 * Red numeric badge (pending reports against `targetId`) — admin only.
 * Reads public.reports (single table, all report_type values).
 */
export function ReportBadge({ targetId }: ReportBadgeProps) {
  const { me, isAdmin } = useAuth();
  const [count, setCount] = useState(0);

  const canSee = !!me && !!targetId && !!isAdmin;

  useEffect(() => {
    if (!canSee || !targetId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const n = await fetchPendingCountForUser(targetId);
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    void load();

    const channel = supabase
      .channel(`reports-badge-${targetId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "reports" },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [canSee, targetId]);

  if (!canSee || count <= 0) return null;

  const label = count <= 10 ? CIRCLED[count] : `${count}+`;
  return (
    <span
      title={`${count} đơn tố cáo đang chờ xử lý`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 24,
        height: 24,
        padding: "0 7px",
        borderRadius: 999,
        background: "hsl(var(--destructive))",
        color: "hsl(var(--destructive-foreground))",
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: "0 0 0 2px hsl(var(--background))",
      }}
    >
      {label}
    </span>
  );
}
