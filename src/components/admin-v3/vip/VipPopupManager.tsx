/**
 * VipPopupManager — Admin Panel → "Quản lý Popup VIP".
 * Nguồn dữ liệu DUY NHẤT cho popup mở khoá tính năng của toàn website
 * (Live, Gọi thoại, Gọi video, Kết bạn Zalo, Xem số Zalo…).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_VIP_UNLOCK_CONFIG,
  VIP_ICON_KEYS,
  VIP_VARIANT_LABELS,
  fetchVipUnlockConfig,
  invalidateVipUnlockConfig,
  saveVipUnlockConfig,
  type VipUnlockConfig,
  type VipVariantKey,
} from "@/lib/vip-unlock-config";
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";

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

const VARIANT_KEYS: VipVariantKey[] = ["default", "voice", "video", "live", "zalo", "phone"];

export function VipPopupManager() {
  const [cfg, setCfg] = useState<VipUnlockConfig>(DEFAULT_VIP_UNLOCK_CONFIG);
  const [benefitsText, setBenefitsText] = useState(DEFAULT_VIP_UNLOCK_CONFIG.benefits.join("\n"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<VipVariantKey | null>(null);

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

  const patchVariant = (key: VipVariantKey, patch: Partial<VipUnlockConfig["variants"][VipVariantKey]>) =>
    setCfg((c) => ({ ...c, variants: { ...c.variants, [key]: { ...c.variants[key], ...patch } } }));

  const save = async () => {
    setSaving(true);
    try {
      const benefits = benefitsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await saveVipUnlockConfig({ ...cfg, benefits });
      setCfg((c) => ({ ...c, benefits }));
      toast.success("Đã lưu — toàn bộ popup VIP trên website đã cập nhật.");
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 16, opacity: 0.7 }}>Đang tải cấu hình popup…</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🔒 Quản lý Popup VIP</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.72 }}>
        Một popup duy nhất — một nguồn dữ liệu duy nhất — một link Admin duy nhất. Mọi popup khoá
        tính năng (Live, Gọi thoại, Gọi video, Kết bạn Zalo, Xem số Zalo) đều lấy nội dung tại đây.
      </p>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Nội dung chung</h3>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Tiêu đề
          <input style={field} value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Mô tả
          <textarea
            style={{ ...field, minHeight: 68 }}
            value={cfg.message}
            onChange={(e) => setCfg({ ...cfg, message: e.target.value })}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Danh sách quyền lợi (mỗi dòng 1 mục)
          <textarea
            style={{ ...field, minHeight: 120 }}
            value={benefitsText}
            onChange={(e) => setBenefitsText(e.target.value)}
          />
        </label>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Icon mặc định
            <select style={field} value={cfg.icon} onChange={(e) => setCfg({ ...cfg, icon: e.target.value })}>
              {VIP_ICON_KEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Nhãn nút chính
            <input
              style={field}
              value={cfg.buttonLabel}
              onChange={(e) => setCfg({ ...cfg, buttonLabel: e.target.value })}
            />
          </label>
        </div>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Hoặc dán URL ảnh icon (ưu tiên hơn icon mặc định)
          <input
            style={field}
            placeholder="https://.../icon.png"
            value={/^(https?:\/\/|\/)/i.test(cfg.icon) ? cfg.icon : ""}
            onChange={(e) => setCfg({ ...cfg, icon: e.target.value || "lock" })}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Link "Liên hệ Admin" (dùng chung toàn website)
          <input
            style={field}
            placeholder="https://zalo.me/… hoặc https://facebook.com/…"
            value={cfg.link}
            onChange={(e) => setCfg({ ...cfg, link: e.target.value })}
          />
        </label>
      </div>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Biến thể theo tính năng</h3>
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>
          Chỉ đổi tiêu đề / mô tả / icon. Giao diện popup luôn giống hệt nhau. Bỏ trống = dùng nội
          dung chung ở trên.
        </p>
        {VARIANT_KEYS.map((k) => (
          <div key={k} style={{ display: "grid", gap: 6, paddingTop: 8, borderTop: "1px dashed rgba(120,120,140,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 13.5 }}>{VIP_VARIANT_LABELS[k]}</strong>
              <button
                type="button"
                onClick={() => setPreview(k)}
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(120,120,140,0.35)", cursor: "pointer" }}
              >
                Xem thử
              </button>
            </div>
            <input
              style={field}
              placeholder="Tiêu đề riêng (tuỳ chọn)"
              value={cfg.variants[k]?.title || ""}
              onChange={(e) => patchVariant(k, { title: e.target.value })}
            />
            <input
              style={field}
              placeholder="Mô tả riêng (tuỳ chọn)"
              value={cfg.variants[k]?.message || ""}
              onChange={(e) => patchVariant(k, { message: e.target.value })}
            />
            <select
              style={field}
              value={cfg.variants[k]?.icon || ""}
              onChange={(e) => patchVariant(k, { icon: e.target.value })}
            >
              <option value="">(dùng icon mặc định)</option>
              {VIP_ICON_KEYS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

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

      <VipUnlockModal
        open={!!preview}
        variant={preview || "default"}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

export default VipPopupManager;
