// src/components/bots/risk-overview-panel.tsx
import { useEffect, useMemo, useState } from "react";
import { listRiskScores, type RiskScoreRow, RISK_COLOR } from "@/lib/bot-system";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RiskOverviewPanel() {
  const [rows, setRows] = useState<RiskScoreRow[] | null>(null);

  useEffect(() => {
    listRiskScores(50).then(setRows).catch(() => setRows([]));
  }, []);

  const buckets = useMemo(() => {
    const b: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    rows?.forEach((r) => (b[r.level] = (b[r.level] ?? 0) + 1));
    return Object.entries(b).map(([level, count]) => ({ level, count }));
  }, [rows]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-2 text-sm font-semibold">Phân bố mức độ rủi ro</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="level" stroke="rgba(255,255,255,0.5)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "rgba(20,20,30,0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="url(#riskGrad)" />
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="mb-2 text-sm font-semibold">Top users theo điểm rủi ro</div>
        <div className="max-h-56 overflow-auto">
          {!rows && <div className="text-sm text-muted-foreground">Đang tải…</div>}
          {rows?.length === 0 && (
            <div className="text-sm text-muted-foreground">Chưa có dữ liệu rủi ro.</div>
          )}
          <ul className="space-y-1">
            {rows?.slice(0, 20).map((r) => (
              <li
                key={r.user_id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
              >
                <span className="font-mono">{r.user_id.slice(0, 8)}…</span>
                <span className={RISK_COLOR[r.level]}>
                  {r.level} · {r.score}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
