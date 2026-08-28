import { useCallback, useEffect, useState } from "react";
import { Heart, Search, RotateCcw, Plus, Minus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const sb = supabase as any;

type HeartRow = {
  follower_id: string;
  following_id: string;
  created_at: string | null;
  fromName: string;
  toName: string;
};

type TargetProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  public_id: string | null;
  followers_count: number | null;
};

/** Quản lý Tim Hồ Sơ — xem ai thả tim cho ai + reset / cộng / trừ tim. */
export function ProfileHeartsManager() {
  const [rows, setRows] = useState<HeartRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<TargetProfile | null>(null);
  const [amount, setAmount] = useState(1);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb
        .from("follows")
        .select("follower_id, following_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const list = (data ?? []) as Array<{ follower_id: string; following_id: string; created_at: string | null }>;
      const ids = Array.from(new Set(list.flatMap((r) => [r.follower_id, r.following_id]))).filter(Boolean);
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await sb.from("profiles").select("id, full_name, username").in("id", ids);
        for (const p of (profs ?? []) as any[]) names.set(p.id, p.full_name || p.username || p.id.slice(0, 8));
      }
      setRows(
        list.map((r) => ({
          ...r,
          fromName: names.get(r.follower_id) || r.follower_id.slice(0, 8),
          toName: names.get(r.following_id) || r.following_id.slice(0, 8),
        })),
      );
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách tim");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const findTarget = async () => {
    const term = q.trim();
    if (!term) return;
    try {
      let pq: any = sb.from("profiles").select("id, full_name, username, public_id, followers_count").limit(1);
      if (/^[0-9a-f-]{8,}$/i.test(term)) pq = pq.or(`id.eq.${term},public_id.ilike.%${term}%`);
      else pq = pq.or(`public_id.ilike.%${term}%,username.ilike.%${term}%,full_name.ilike.%${term}%`);
      const { data, error } = await pq.maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.warning("Không tìm thấy hồ sơ");
        setTarget(null);
        return;
      }
      setTarget(data as TargetProfile);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tìm kiếm");
    }
  };

  const setCount = async (next: number) => {
    if (!target) return;
    const value = Math.max(0, Math.floor(next));
    const prev = target.followers_count ?? 0;
    setTarget({ ...target, followers_count: value }); // cập nhật local trước
    const { error } = await sb.from("profiles").update({ followers_count: value }).eq("id", target.id);
    if (error) {
      setTarget((t) => (t ? { ...t, followers_count: prev } : t));
      toast.error(error.message);
      return;
    }
    toast.success(`Đã cập nhật: ${value} tim`);
  };

  const current = target?.followers_count ?? 0;

  return (
    <div className="admv3-page">
      <div className="admv3-page-head">
        <div>
          <h2 className="admv3-page-title">Quản lý Tim Hồ Sơ</h2>
          <p className="admv3-page-sub">Xem ai thả tim cho ai, thời gian, và reset / cộng / trừ tim theo hồ sơ.</p>
        </div>
      </div>

      <div className="admv3-toolbar">
        <div className="admv3-search admv3-search-lg">
          <Search size={14} />
          <input
            placeholder="Nhập UID / Username / Tên rồi Enter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && findTarget()}
          />
        </div>
        <button className="admv3-btn admv3-btn-primary" onClick={findTarget}>
          Tìm hồ sơ
        </button>
      </div>

      {target && (
        <div className="admv3-profile-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700 }}>{target.full_name || target.username || "—"}</div>
              <div className="admv3-mono" style={{ opacity: 0.7, fontSize: 12 }}>
                {target.public_id || target.id.slice(0, 8)}
              </div>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
              <Heart size={16} /> {current}
            </div>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 90, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "inherit" }}
            />
            <button className="admv3-btn admv3-btn-ghost" onClick={() => setCount(current + amount)}>
              <Plus size={13} /> Cộng
            </button>
            <button className="admv3-btn admv3-btn-ghost" onClick={() => setCount(current - amount)}>
              <Minus size={13} /> Trừ
            </button>
            <button className="admv3-btn admv3-btn-danger" onClick={() => setCount(0)}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </div>
      )}

      <div className="admv3-profile-card" style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
          <span>50 lượt thả tim gần nhất</span>
          <button className="admv3-btn admv3-btn-ghost" onClick={loadRecent} disabled={loading}>
            {loading ? "Đang tải…" : "Làm mới"}
          </button>
        </div>
        <div style={{ maxHeight: 460, overflowY: "auto" }}>
          {rows.length === 0 && !loading ? (
            <div style={{ padding: 20, opacity: 0.6, fontSize: 13 }}>Chưa có dữ liệu.</div>
          ) : (
            rows.map((r) => (
              <div
                key={`${r.follower_id}-${r.following_id}-${r.created_at ?? ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  borderTop: "1px solid rgba(148,163,184,.16)",
                  fontSize: 13,
                }}
              >
                <Heart size={13} style={{ color: "#f2456b", flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{r.fromName}</b> → <b>{r.toName}</b>
                </span>
                <span style={{ opacity: 0.6, fontSize: 12, flex: "none" }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString("vi-VN") : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
