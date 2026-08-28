/**
 * TOP TƯƠNG TÁC TUẦN — thẻ Top 10 hiển thị ở Trang chủ.
 *
 * • Dữ liệu lấy 1 lần khi mount qua `fetchTopInteraction()` (đã có cache 5').
 *   KHÔNG polling, KHÔNG cron, KHÔNG gọi lặp.
 * • Điểm hiển thị = max(điểm thật, điểm mô phỏng nội suy theo thời gian).
 */
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { avatarSrc } from "@/lib/image-cdn";
import { fetchTopInteraction, type TopRow } from "@/lib/top-interaction";
import "@/styles/top-interaction.css";

type Props = {
  limit?: number;
  title?: string;
};

export function TopInteractionCard({ limit = 10, title = "Top tương tác hôm nay" }: Props) {
  const [rows, setRows] = useState<TopRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTopInteraction(limit);
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="ti-card" aria-label={title}>
      <header className="ti-head">
        <div>
          <div className="ti-title">
            <Trophy size={13} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
            {title}
          </div>
          <div className="ti-sub">Top 10 thành viên tương tác nhiều nhất trong ngày</div>
        </div>
      </header>

      <div className="ti-list">
        {rows.map((r, i) => (
          <div key={r.user_id} className={`ti-row ${i < 3 ? `is-top${i + 1}` : ""}`}>
            <span className="ti-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
            <img
              className="ti-avatar"
              loading="lazy"
              decoding="async"
              src={avatarSrc(r.avatar || "/placeholder.svg", 64)}
              alt={r.name}
            />
            <div className="ti-main">
              <div className="ti-name">{r.name}</div>
              <div className="ti-meta">Điểm tương tác</div>
            </div>
            <span className="ti-score">{r.score.toLocaleString("vi-VN")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TopInteractionCard;
