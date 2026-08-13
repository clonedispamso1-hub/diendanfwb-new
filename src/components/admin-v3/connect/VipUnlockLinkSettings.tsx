/**
 * VipUnlockLinkSettings — 1 ô duy nhất để đổi link "Liên hệ Admin" của popup
 * mở khoá VIP dùng chung toàn website (admin_site_settings.vip_contact_link).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { fetchVipUnlockLink, invalidateVipUnlockLink } from "@/lib/vip-unlock-link";

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};

export function VipUnlockLinkSettings() {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    invalidateVipUnlockLink();
    setUrl(await fetchVipUnlockLink());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const value = { url: url.trim() };
      await adminSetSiteSetting("vip_contact_link", value);
      // Giữ đồng bộ các key cũ để không nơi nào bị lệch link.
      await adminSetSiteSetting("community_link", value);
      await adminSetSiteSetting("admin_contact_url", value);
      invalidateVipUnlockLink();
      toast.success("Đã lưu link — toàn bộ popup VIP đã cập nhật.");
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid rgba(120,120,140,0.28)",
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        display: "grid",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🔒 Link popup mở khoá VIP (dùng chung)</h3>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
        Toàn bộ popup khoá tính năng (Kết bạn Zalo, Xem số Zalo, Live Mộc, Gửi lời mời…) đều dùng
        link này. Đổi 1 lần → cả website đổi theo.
      </p>
      <input
        style={input}
        placeholder="https://zalo.me/... hoặc https://facebook.com/..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            fontWeight: 700,
            border: "1px solid rgba(120,120,140,0.35)",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Đang lưu…" : "Lưu link"}
        </button>
      </div>
    </div>
  );
}

export default VipUnlockLinkSettings;
