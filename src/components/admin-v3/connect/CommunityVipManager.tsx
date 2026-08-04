/**
 * Admin — Quản lý Cộng Đồng VIP.
 * Toàn bộ nội dung trang "Vào Cộng Đồng" sửa được ở đây, không cần sửa code.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_COMMUNITY_PAGE,
  fetchCommunityPage,
  saveCommunityPage,
  type CommunityPageContent,
} from "@/lib/connect/community-content";

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};

export function CommunityVipManager() {
  const [c, setC] = useState<CommunityPageContent | null>(null);
  const [imagesText, setImagesText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchCommunityPage();
    setC(data);
    setImagesText(data.image_urls.join("\n"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!c) return <div style={{ padding: 20, opacity: 0.7 }}>Đang tải nội dung…</div>;

  const set = <K extends keyof CommunityPageContent>(k: K, v: CommunityPageContent[K]) =>
    setC({ ...c, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await saveCommunityPage({
        ...c,
        image_urls: imagesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success("Đã lưu nội dung Cộng Đồng VIP.");
      await load();
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  const LINKS: {
    urlKey: "zalo_url" | "facebook_url" | "telegram_url" | "admin_url";
    showKey: "show_zalo" | "show_facebook" | "show_telegram" | "show_admin";
    label: string;
    ph: string;
  }[] = [
    { urlKey: "zalo_url", showKey: "show_zalo", label: "Link Zalo", ph: "https://zalo.me/g/..." },
    { urlKey: "facebook_url", showKey: "show_facebook", label: "Link Facebook", ph: "https://facebook.com/..." },
    { urlKey: "telegram_url", showKey: "show_telegram", label: "Link Telegram", ph: "https://t.me/..." },
    { urlKey: "admin_url", showKey: "show_admin", label: "Link Admin", ph: "https://m.me/... hoặc https://zalo.me/09..." },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>👑 Quản lý Cộng Đồng VIP</h2>
      <p style={{ margin: "0 0 18px", opacity: 0.7, fontSize: 13.5 }}>
        Nội dung này hiện ở tab <strong>“Vào Cộng Đồng”</strong> trên trang chủ. Lưu là áp dụng ngay.
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Tiêu đề</span>
          <input style={input} value={c.title} onChange={(e) => set("title", e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Nội dung</span>
          <textarea
            style={{ ...input, minHeight: 260, resize: "vertical", lineHeight: 1.6 }}
            value={c.body}
            onChange={(e) => set("body", e.target.value)}
          />
          <span style={{ opacity: 0.6, fontSize: 12 }}>
            Cách 1 dòng trống để tách đoạn (quyền lợi, cách tham gia, quy định…).
          </span>
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Banner (URL ảnh)</span>
          <input
            style={input}
            placeholder="https://..."
            value={c.banner_url}
            onChange={(e) => set("banner_url", e.target.value)}
          />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Ảnh (mỗi dòng 1 URL)</span>
          <textarea
            style={{ ...input, minHeight: 90, resize: "vertical" }}
            value={imagesText}
            onChange={(e) => setImagesText(e.target.value)}
          />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Video (YouTube hoặc URL mp4)</span>
          <input
            style={input}
            placeholder="https://youtu.be/... hoặc https://.../video.mp4"
            value={c.video_url}
            onChange={(e) => set("video_url", e.target.value)}
          />
        </label>

        <h3 style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 800 }}>👤 Link Hồ Sơ Admin</h3>
        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Link trang cá nhân Admin</span>
          <input
            style={input}
            placeholder="/profile/xxxxx"
            value={c.admin_profile_link}
            onChange={(e) => set("admin_profile_link", e.target.value)}
          />
          <span style={{ opacity: 0.6, fontSize: 12 }}>
            Nút “Liên hệ Admin” trong popup Cộng đồng VIP sẽ mở đúng link này. Đổi link là toàn bộ
            website cập nhật ngay, không cần sửa code.
          </span>
        </label>

        <h3 style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 800 }}>🔗 Nút bấm</h3>
        {LINKS.map((f) => (
          <div key={f.urlKey} style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            <span style={{ fontWeight: 700, opacity: 0.85 }}>{f.label}</span>
            <input
              style={input}
              placeholder={f.ph}
              value={c[f.urlKey]}
              onChange={(e) => set(f.urlKey, e.target.value)}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={c[f.showKey]}
                onChange={(e) => set(f.showKey, e.target.checked)}
              />
              <span style={{ opacity: 0.8 }}>Hiện nút này trên trang</span>
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: 0,
            background: "hsl(211 100% 50%)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
        <button
          type="button"
          onClick={() => {
            setC({ ...DEFAULT_COMMUNITY_PAGE });
            setImagesText("");
          }}
          style={{ ...input, width: "auto", padding: "10px 16px", cursor: "pointer", fontWeight: 700 }}
        >
          Về nội dung mẫu
        </button>
      </div>
    </div>
  );
}

export default CommunityVipManager;
