/**
 * Admin — Popup bắt buộc của Website.
 * Toàn bộ cấu hình lưu ở Supabase #2 (bảng site_settings2), KHÔNG đụng DB chính.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_REQUIRED_POPUP,
  fetchRequiredPopup,
  saveRequiredPopup,
  type RequiredPopupConfig,
} from "@/lib/site/db2-settings";

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};

const HOURS = [0.5, 1, 2, 6, 12, 24, 72, 168];

export function RequiredPopupManager() {
  const [c, setC] = useState<RequiredPopupConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setC(await fetchRequiredPopup(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!c) return <div style={{ padding: 20, opacity: 0.7 }}>Đang tải cấu hình…</div>;

  const set = <K extends keyof RequiredPopupConfig>(k: K, v: RequiredPopupConfig[K]) =>
    setC({ ...c, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await saveRequiredPopup(c);
      toast.success("Đã lưu Popup bắt buộc.");
      await load();
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>🚨 Popup bắt buộc</h2>
      <p style={{ margin: "0 0 18px", opacity: 0.7, fontSize: 13.5 }}>
        Wizard <strong>2 bước</strong> (Tham gia Fanpage → Tham gia Nhóm Facebook),
        chỉ hiện <strong>sau khi người dùng đăng nhập</strong>. Lưu ở <strong>Supabase #2</strong>.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={c.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        <span style={{ fontWeight: 700 }}>Bật popup</span>
      </label>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, marginBottom: 5 }}>Tiêu đề (ghi chú nội bộ)</div>
          <input style={input} value={c.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div>
          <div style={{ fontSize: 13, marginBottom: 5 }}>
            Nội dung (ghi chú nội bộ — wizard dùng nội dung 2 bước cố định)
          </div>
          <textarea
            style={{ ...input, minHeight: 160, resize: "vertical" }}
            value={c.content}
            onChange={(e) => set("content", e.target.value)}
          />
        </div>

        <div>
          <div style={{ fontSize: 13, marginBottom: 5 }}>Bước 2 — Link Nhóm Facebook (tham gia nhóm)</div>
          <input
            style={input}
            placeholder="https://facebook.com/groups/..."
            value={c.facebook_url}
            onChange={(e) => set("facebook_url", e.target.value)}
          />
        </div>

        <div>
          <div style={{ fontSize: 13, marginBottom: 5 }}>Bước 1 — Link Fanpage (theo dõi)</div>
          <input
            style={input}
            placeholder="https://facebook.com/fanpage"
            value={c.fanpage_url}
            onChange={(e) => set("fanpage_url", e.target.value)}
          />
        </div>


        <div>
          <div style={{ fontSize: 13, marginBottom: 5 }}>Thời gian ẩn popup sau khi hoàn thành 2 bước</div>
          <select
            style={input}
            value={HOURS.includes(c.hide_hours) ? String(c.hide_hours) : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") set("hide_hours", Number(e.target.value));
            }}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h < 1 ? `${h * 60} phút` : h < 24 ? `${h} giờ` : `${h / 24} ngày`}
              </option>
            ))}
            <option value="custom">Tuỳ chỉnh (nhập bên dưới)</option>
          </select>
          <input
            style={{ ...input, marginTop: 8 }}
            type="number"
            min={0.5}
            step={0.5}
            value={c.hide_hours}
            onChange={(e) => set("hide_hours", Math.max(0.5, Number(e.target.value) || 0.5))}
          />
        </div>
      </div>

      <button
        className="admv3-btn"
        style={{ marginTop: 18 }}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Đang lưu…" : "💾 Lưu cấu hình"}
      </button>

      <p style={{ marginTop: 14, fontSize: 12.5, opacity: 0.65 }}>
        Mặc định: {DEFAULT_REQUIRED_POPUP.hide_hours} giờ. Tắt popup là toàn website không hiện nữa.
      </p>
    </div>
  );
}

export default RequiredPopupManager;
