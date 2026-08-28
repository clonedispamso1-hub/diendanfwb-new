import { useEffect, useState, useCallback } from "react";
import { Radio, X, MicOff, RefreshCw, Flag } from "lucide-react";
import { db2 } from "@/lib/db/router";
import { ModuleShell, StatCard, StatusBadge, EmptyHint } from "./module-shell";
import { logAdminAction } from "@/lib/admin-permissions";

type LiveRow = {
  id: string;
  title?: string | null;
  host_id?: string | null;
  status?: string | null;
  viewer_count?: number | null;
  created_at?: string | null;
};

const NSFW_KEYWORDS = ["sex", "khoả", "khoa than", "18+", "nude"];
const SPAM_KEYWORDS = ["click", "kiếm tiền", "vay tiền", "casino", "tài xỉu"];

function riskScore(title: string | null | undefined): { tone: "good" | "warn" | "bad"; flags: string[] } {
  const t = (title || "").toLowerCase();
  const flags: string[] = [];
  if (NSFW_KEYWORDS.some((k) => t.includes(k))) flags.push("NSFW");
  if (SPAM_KEYWORDS.some((k) => t.includes(k))) flags.push("Spam");
  return { tone: flags.includes("NSFW") ? "bad" : flags.length ? "warn" : "good", flags };
}

export function LiveSystemControl() {
  // Live Móc nằm ở Supabase #2 (media/VIP) — không dùng client core (#1).
  const sb = db2() as any;
  const [rooms, setRooms] = useState<LiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("live_moc_rooms")
      .select("id, title, viewers, is_online, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error && (error.code === "42P01" || /relation .* does not exist/i.test(error.message))) {
      setAvailable(false);
    } else {
      setRooms(
        ((data as any[]) ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.is_online ? "live" : "offline",
          viewer_count: r.viewers ?? 0,
          created_at: r.created_at,
        })),
      );
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const closeRoom = async (r: LiveRow) => {
    const { error } = await sb.from("live_moc_rooms").update({ is_online: false }).eq("id", r.id);
    if (!error) {
      await logAdminAction("live_control", "close_room", "live_room", r.id, { title: r.title });
      void load();
    }
  };

  const flagged = rooms.filter((r) => riskScore(r.title).flags.length > 0).length;

  return (
    <ModuleShell
      title="Live System Control"
      subtitle="Giám sát phòng live, phát hiện rủi ro"
      actions={<button className="icon-button" onClick={() => void load()}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Phòng live" value={rooms.length} />
        <StatCard label="Cảnh báo" value={flagged} tone={flagged ? "warn" : "good"} />
      </div>

      {!available ? (
        <EmptyHint>Module chưa kích hoạt: bảng <code>live_moc_rooms</code> chưa tồn tại.</EmptyHint>
      ) : loading ? (
        <EmptyHint>Đang tải…</EmptyHint>
      ) : rooms.length === 0 ? (
        <EmptyHint>Không có phòng live nào.</EmptyHint>
      ) : (
        <div className="adm-list">
          {rooms.map((r) => {
            const risk = riskScore(r.title);
            return (
              <div key={r.id} className="adm-row">
                <div className="adm-row-icon"><Radio size={16} /></div>
                <div className="adm-row-main">
                  <div className="adm-row-title">{r.title || "(không tiêu đề)"}</div>
                  <div className="adm-row-meta">
                    <StatusBadge status={r.status || "active"} />
                    <span>👁 {r.viewer_count ?? 0}</span>
                    {risk.flags.map((f) => (
                      <span key={f} className={`adm-badge adm-badge-${risk.tone}`}>
                        <Flag size={10} /> {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="secondary-cta compact" style={{ padding: "6px 8px", fontSize: "0.7rem" }} title="Mute (chưa cấu hình)">
                    <MicOff size={12} />
                  </button>
                  <button
                    className="secondary-cta compact danger-button"
                    style={{ padding: "6px 8px", fontSize: "0.7rem" }}
                    onClick={() => void closeRoom(r)}
                  >
                    <X size={12} /> Đóng
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModuleShell>
  );
}
