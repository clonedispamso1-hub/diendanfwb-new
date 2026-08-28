/**
 * VipPopupManager — Admin Panel → "Quản lý Popup Chung".
 * Nguồn dữ liệu DUY NHẤT cho popup khoá tính năng của toàn website
 * (Kết bạn Zalo, Facebook, Xem số điện thoại, Live Móc, Voice/Video Call, Chat…).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_VIP_UNLOCK_CONFIG,
  fetchVipUnlockConfig,
  invalidateVipUnlockConfig,
  saveVipUnlockConfig,
  type VipUnlockConfig,
  type VipFeatureItem,
} from "@/lib/vip-unlock-config";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};

const card: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.28)",
  borderRadius: 14,
  padding: 14,
  marginBottom: 16,
  display: "grid",
  gap: 10,
};

const LINK_PRESETS = [
  { label: "Facebook Admin", value: "https://www.facebook.com/" },
  { label: "Zalo Admin", value: "https://zalo.me/" },
];

export function VipPopupManager() {
  const [cfg, setCfg] = useState<VipUnlockConfig>(DEFAULT_VIP_UNLOCK_CONFIG);
  const [benefitsText, setBenefitsText] = useState(DEFAULT_VIP_UNLOCK_CONFIG.benefits.join("\n"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    invalidateVipUnlockConfig();
    void fetchVipUnlockConfig().then((c) => {
      if (!alive) return;
      setCfg(c);
      setBenefitsText(c.benefits.join("\n"));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const benefits = benefitsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await saveVipUnlockConfig({ ...cfg, benefits });
      setCfg((c) => ({ ...c, benefits }));
      toast.success("Đã lưu — toàn bộ popup khoá tính năng đã cập nhật.");
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  const readFile = (file: File, cb: (v: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const updateFeature = (i: number, patch: Partial<VipFeatureItem>) =>
    setCfg((c) => ({ ...c, features: c.features.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));

  const removeFeature = (i: number) =>
    setCfg((c) => ({ ...c, features: c.features.filter((_, k) => k !== i) }));

  const addFeature = () =>
    setCfg((c) => ({ ...c, features: [...c.features, { icon: "✨", title: "", subtitle: "" }] }));

  const uploadIcon = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCfg((c) => ({ ...c, icon: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  if (loading) return <div style={{ padding: 16, opacity: 0.7 }}>Đang tải cấu hình popup…</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🔒 Quản lý Popup Chung</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.72 }}>
        Chỉ có <strong>một popup duy nhất</strong> cho mọi tính năng khoá (Kết bạn Zalo, Facebook,
        Xem số điện thoại, Live Móc, Voice Call, Video Call, Chat…). Sửa ở đây → toàn website đổi theo.
      </p>

      <div style={card}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Tiêu đề (hỗ trợ biến <code>{"{location}"}</code> — khu vực của thành viên)
          <input
            style={field}
            placeholder="Cộng Đồng Zalo Khu Vực {location}"
            value={cfg.title}
            onChange={(e) => setCfg({ ...cfg, title: e.target.value })}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Khu vực mặc định (khi thành viên chưa chọn khu vực)
          <input
            style={field}
            placeholder="Toàn Quốc"
            value={cfg.defaultLocation}
            onChange={(e) => setCfg({ ...cfg, defaultLocation: e.target.value })}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Nội dung (hỗ trợ biến <code>{"{location}"}</code>)
          <textarea
            style={{ ...field, minHeight: 80 }}
            placeholder={"Bạn chưa tham gia Cộng Đồng VIP Zalo {location}.\nTham gia để mở khóa:"}
            value={cfg.message}
            onChange={(e) => setCfg({ ...cfg, message: e.target.value })}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Danh sách quyền lợi (mỗi dòng 1 mục, hỗ trợ biến <code>{"{location}"}</code>)
          <textarea
            style={{ ...field, minHeight: 120 }}
            value={benefitsText}
            onChange={(e) => setBenefitsText(e.target.value)}
          />
        </label>
      </div>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>🖼️ Header Media (ảnh/GIF trên cùng popup)</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            URL ảnh/GIF (hoặc emoji)
            <input
              style={field}
              placeholder="https://.../header.gif"
              value={cfg.headerMedia}
              onChange={(e) => setCfg({ ...cfg, headerMedia: e.target.value })}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Hoặc tải lên (PNG/JPG/WEBP/GIF)
            <input
              style={field}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f, (v) => setCfg((c) => ({ ...c, headerMedia: v })));
              }}
            />
          </label>
        </div>
        {cfg.headerMedia && /^(https?:\/\/|data:image|\/)/i.test(cfg.headerMedia) ? (
          <img src={cfg.headerMedia} alt="" style={{ width: 84, height: 84, borderRadius: 18, objectFit: "cover" }} />
        ) : null}
      </div>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>📋 Danh sách Feature Items</h3>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
          Mỗi dòng gồm: Icon (emoji hoặc URL ảnh), Tiêu đề chính và Dòng mô tả nhỏ. Tất cả đều hỗ trợ biến <code>{"{location}"}</code>.
        </p>
        {cfg.features.map((f, i) => (
          <div key={i} style={{ display: "grid", gap: 6, gridTemplateColumns: "70px 1fr 1.4fr 34px", alignItems: "center" }}>
            <input style={field} placeholder="💬" value={f.icon} onChange={(e) => updateFeature(i, { icon: e.target.value })} />
            <input style={field} placeholder="Tiêu đề chính (hỗ trợ {location})" value={f.title} onChange={(e) => updateFeature(i, { title: e.target.value })} />
            <input style={field} placeholder="Mô tả nhỏ (hỗ trợ {location})" value={f.subtitle} onChange={(e) => updateFeature(i, { subtitle: e.target.value })} />
            <button
              type="button"
              onClick={() => removeFeature(i)}
              title="Xóa dòng"
              style={{ padding: "8px 0", borderRadius: 8, border: "1px solid rgba(220,80,80,.4)", color: "#dc2626", cursor: "pointer", background: "transparent" }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addFeature}
          style={{ justifySelf: "start", padding: "7px 14px", borderRadius: 10, border: "1px solid rgba(120,120,140,0.35)", cursor: "pointer", background: "transparent", color: "inherit" }}
        >
          + Thêm dòng
        </button>
      </div>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Icon &amp; màu nút</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Emoji hoặc URL ảnh
            <input
              style={field}
              placeholder="🔒 hoặc https://.../icon.png"
              value={cfg.icon}
              onChange={(e) => setCfg({ ...cfg, icon: e.target.value })}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Hoặc tải icon lên (PNG/JPG/WEBP/SVG)
            <input
              style={field}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadIcon(f);
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Tên nút CTA (hỗ trợ biến <code>{"{location}"}</code>)
            <input
              style={field}
              placeholder="Liên Hệ Admin {location}"
              value={cfg.buttonLabel}
              onChange={(e) => setCfg({ ...cfg, buttonLabel: e.target.value })}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Màu nút
            <input
              style={{ ...field, padding: 4, height: 40 }}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(cfg.buttonColor) ? cfg.buttonColor : "#2563eb"}
              onChange={(e) => setCfg({ ...cfg, buttonColor: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div style={card}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Link liên kết Admin (Zalo / Telegram / Facebook) — mở tab mới
          <input
            style={field}
            placeholder="https://zalo.me/… hoặc https://facebook.com/…"
            value={cfg.link}
            onChange={(e) => setCfg({ ...cfg, link: e.target.value })}
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {LINK_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setCfg({ ...cfg, link: p.value })}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(120,120,140,0.35)", cursor: "pointer" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: "10px 20px",
            borderRadius: 12,
            fontWeight: 800,
            border: "1px solid rgba(120,120,140,0.35)",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Đang lưu…" : "Lưu cấu hình popup"}
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid rgba(120,120,140,0.35)", cursor: "pointer" }}
        >
          Xem thử (theo cấu hình đã lưu)
        </button>
      </div>

      <CommonLockedPopup open={preview} onClose={() => setPreview(false)} />
    </div>
  );
}

export default VipPopupManager;
