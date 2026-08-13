import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DragonBallIcon } from "@/components/candy/gift/dragon-ball-icon";
import { getBallByTier } from "@/components/candy/gift/dragon-ball-catalog";

interface GiftRow {
  id: string;
  post_id: string;
  from_user_id: string;
  amount: number;
  ball_tier: number | null;
  created_at: string;
  sender?: { full_name: string | null; public_id: string | null } | null;
  post?: { user_id: string; profiles?: { full_name: string | null; public_id: string | null } | null } | null;
  notif?: { id: string; is_read: boolean; data: any } | null;
}

/**
 * GiftHistoryManager — Admin tab: xem toàn bộ lịch sử tặng quà.
 * Cột: Người tặng · Người nhận · Bài viết · Loại · Giá trị · Thời gian ·
 *      Đã mở lì xì · Đã chia thưởng.
 */
export function GiftHistoryManager() {
  const [rows, setRows] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "dragon" | "gem">("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: gifts } = await supabase
        .from("post_gifts" as any)
        .select("id, post_id, from_user_id, amount, ball_tier, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = (gifts as any as GiftRow[] | null) || [];

      const senderIds = Array.from(new Set(list.map((r) => r.from_user_id).filter(Boolean)));
      const postIds = Array.from(new Set(list.map((r) => r.post_id).filter(Boolean)));
      const giftIds = list.map((r) => r.id);

      const [{ data: senders }, { data: posts }, { data: notifs }] = await Promise.all([
        senderIds.length
          ? supabase.from("profiles").select("id, full_name, public_id").in("id", senderIds)
          : Promise.resolve({ data: [] as any }),
        postIds.length
          ? supabase.from("posts").select("id, user_id").in("id", postIds)
          : Promise.resolve({ data: [] as any }),
        giftIds.length
          ? supabase.from("notifications").select("id, is_read, data").in("data->>gift_id", giftIds as any)
          : Promise.resolve({ data: [] as any }),
      ]);
      const senderMap = new Map<string, any>((senders || []).map((s: any) => [s.id, s]));
      const postMap = new Map<string, any>((posts || []).map((p: any) => [p.id, p]));

      const receiverIds = Array.from(new Set((posts || []).map((p: any) => p.user_id).filter(Boolean)));
      const { data: receivers } = receiverIds.length
        ? await supabase.from("profiles").select("id, full_name, public_id").in("id", receiverIds)
        : { data: [] as any };
      const recvMap = new Map<string, any>((receivers || []).map((s: any) => [s.id, s]));

      const notifMap = new Map<string, any>();
      (notifs || []).forEach((n: any) => {
        const gid = n?.data?.gift_id;
        if (gid) notifMap.set(gid, n);
      });

      if (cancelled) return;
      setRows(
        list.map((r) => ({
          ...r,
          sender: senderMap.get(r.from_user_id) || null,
          post: postMap.get(r.post_id)
            ? { ...postMap.get(r.post_id), profiles: recvMap.get(postMap.get(r.post_id).user_id) || null }
            : null,
          notif: notifMap.get(r.id) || null,
        })),
      );
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filtered = rows.filter((r) =>
    filter === "all" ? true : filter === "dragon" ? r.ball_tier != null : r.ball_tier == null,
  );

  /** Xóa VĨNH VIỄN toàn bộ lịch sử quà tặng (chỉ bảng post_gifts). */
  const purgeAll = async () => {
    setPurging(true);
    setNotice(null);
    try {
      // Ưu tiên RPC security-definer (nếu DB đã cài), fallback DELETE trực tiếp.
      const rpc = await (supabase as any).rpc("admin_purge_gift_history");
      let failed = Boolean(rpc?.error);
      if (failed) {
        const { error } = await (supabase.from("post_gifts" as any) as any)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        failed = Boolean(error);
        if (error) setNotice(`Không xóa được: ${error.message}`);
      }
      if (!failed) {
        setRows([]);
        setNotice("Đã xóa toàn bộ lịch sử quà tặng.");
        setConfirmOpen(false);
        setReloadKey((k) => k + 1);
      }
    } finally {
      setPurging(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          style={{
            padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: "#dc2626", color: "#fff", border: "none", cursor: "pointer",
          }}
        >
          🗑 Xóa toàn bộ dữ liệu
        </button>
      </div>

      {notice && (
        <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, opacity: 0.85 }}>{notice}</div>
      )}

      {confirmOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 20, maxWidth: 420, width: "100%" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              ⚠️ Bạn có chắc muốn xóa toàn bộ lịch sử quà tặng?
            </h3>
            <ul style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10, paddingLeft: 18 }}>
              <li>Hành động này KHÔNG THỂ hoàn tác.</li>
              <li>Toàn bộ lịch sử sẽ bị xóa khỏi cơ sở dữ liệu.</li>
              <li>Người dùng và Admin đều không thể xem lại.</li>
              <li>Số dư xu, ngọc rồng và giao dịch KHÔNG bị ảnh hưởng.</li>
            </ul>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                disabled={purging}
                onClick={() => setConfirmOpen(false)}
                style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", cursor: "pointer" }}
              >
                ❌ Hủy
              </button>
              <button
                type="button"
                disabled={purging}
                onClick={() => void purgeAll()}
                style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                {purging ? "Đang xóa…" : "🗑 Xóa toàn bộ"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["all", "dragon", "gem"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              border: "1px solid rgba(0,0,0,0.1)",
              background: filter === k ? "linear-gradient(90deg,#f97316,#f59e0b)" : "transparent",
              color: filter === k ? "#fff" : "inherit",
              cursor: "pointer",
            }}
          >
            {k === "all" ? "Tất cả" : k === "dragon" ? "Ngọc Rồng" : "Coin khác"}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>Chưa có lịch sử tặng quà.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.6, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <th style={{ padding: "10px 8px" }}>Người tặng</th>
                <th style={{ padding: "10px 8px" }}>Người nhận</th>
                <th style={{ padding: "10px 8px" }}>Bài viết</th>
                <th style={{ padding: "10px 8px" }}>Loại</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Giá trị</th>
                <th style={{ padding: "10px 8px" }}>Thời gian</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Đã mở lì xì</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Đã chia thưởng</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ball = getBallByTier(r.ball_tier);
                const receiver = r.post?.profiles;
                const opened = r.notif ? r.notif.is_read : null;
                const status = r.notif?.data?.status;
                const settled = status === "claimed" || status === "settled" || status === "distributed";
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <td style={{ padding: "10px 8px" }}>
                      {r.sender?.full_name || r.sender?.public_id || r.from_user_id.slice(0, 8)}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {receiver?.full_name || receiver?.public_id || (r.post?.user_id ?? "").slice(0, 8)}
                    </td>
                    <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: 11, opacity: 0.7 }}>
                      {r.post_id.slice(0, 8)}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {ball ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <DragonBallIcon tier={ball.tier} size={20} />
                          <span>{ball.tier} sao</span>
                        </span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>Coin</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {r.amount.toLocaleString("vi-VN")}
                    </td>
                    <td style={{ padding: "10px 8px", whiteSpace: "nowrap", opacity: 0.8 }}>
                      {new Date(r.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      {opened == null ? "–" : opened ? "✅" : "⏳"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>{settled ? "✅" : "⏳"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
