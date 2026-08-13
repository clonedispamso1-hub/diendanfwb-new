/**
 * Admin Panel → Quản lý Website → Liên kết.
 * Chỉ cần nhập Facebook Fanpage + Nhóm Zalo → toàn website tự cập nhật.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_SITE_LINKS,
  fetchSiteLinks,
  invalidateSiteLinks,
  saveSiteLinks,
  type SiteLinks,
} from "@/lib/site-links";

const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};

export function SiteLinksManager() {
  const [links, setLinks] = useState<SiteLinks>(DEFAULT_SITE_LINKS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    invalidateSiteLinks();
    void fetchSiteLinks().then((v) => {
      if (!alive) return;
      setLinks(v);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSiteLinks(links);
      toast.success("Đã lưu — toàn website đã cập nhật liên kết.");
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 16, opacity: 0.7 }}>Đang tải liên kết…</div>;

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🔗 Liên kết Website</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.72 }}>
        Nhập một lần — Mini Chat, bong bóng nổi và popup VIP đều dùng chung link này. Không hardcode
        trong code, không cần build lại.
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
          Facebook Fanpage
          <input
            style={field}
            placeholder="https://facebook.com/..."
            value={links.facebook_page}
            onChange={(e) => setLinks({ ...links, facebook_page: e.target.value })}
          />
        </label>

        <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
          Nhóm Zalo
          <input
            style={field}
            placeholder="https://zalo.me/g/..."
            value={links.zalo_group}
            onChange={(e) => setLinks({ ...links, zalo_group: e.target.value })}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          marginTop: 18,
          padding: "10px 20px",
          borderRadius: 12,
          fontWeight: 800,
          border: "1px solid rgba(120,120,140,0.35)",
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? "Đang lưu…" : "💾 Lưu liên kết"}
      </button>
    </div>
  );
}

export default SiteLinksManager;
