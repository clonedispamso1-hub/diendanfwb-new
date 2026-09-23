/**
 * Admin — Quản lý Cộng Đồng VIP.
 * Toàn bộ nội dung trang "Vào Cộng Đồng" sửa được ở đây, không cần sửa code.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_COMMUNITY_PAGE,
  emptySection,
  fetchCommunityPage,
  saveCommunityPage,
  type CommunityPageContent,
  type CommunitySection,
} from "@/lib/connect/community-content";
import { VipUnlockLinkSettings } from "@/components/admin-v3/connect/VipUnlockLinkSettings";
import { MediaUploadButton } from "@/components/admin-v3/connect/MediaUploadButton";
import { LibraryMedia } from "@/components/candy/library-media";

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};

const miniBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 9,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};

const thumbStyle: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 10,
  objectFit: "cover",
  border: "1px solid rgba(120,120,140,0.3)",
  background: "rgba(130,130,160,0.12)",
};

const iconStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 9,
  objectFit: "cover",
  flexShrink: 0,
  background: "rgba(130,130,160,0.14)",
};

const removeChip: React.CSSProperties = {
  position: "absolute",
  top: -6,
  right: -6,
  width: 20,
  height: 20,
  borderRadius: 999,
  border: 0,
  background: "#e5484d",
  color: "#fff",
  fontSize: 13,
  lineHeight: "18px",
  cursor: "pointer",
};

export function CommunityVipManager() {
  const [c, setC] = useState<CommunityPageContent | null>(null);
  const [imagesText, setImagesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

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

  const patchSection = (i: number, patch: Partial<CommunitySection>) =>
    set(
      "sections",
      c.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );

  const removeSection = (i: number) =>
    set(
      "sections",
      c.sections.filter((_, idx) => idx !== i),
    );

  const moveSection = (i: number, dir: -1 | 1) => {
    const next = [...c.sections];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set("sections", next);
  };

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

      <VipUnlockLinkSettings />



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

        <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Banner</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <MediaUploadButton label="⬆️ Tải Banner lên" onUploaded={(u) => set("banner_url", u)} />
            {c.banner_url && (
              <>
                <LibraryMedia url={c.banner_url} className="" style={thumbStyle} />
                <button type="button" style={miniBtn} onClick={() => set("banner_url", "")}>
                  Gỡ
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Ảnh / GIF minh họa</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <MediaUploadButton
              label="⬆️ Tải Icon / GIF lên"
              onUploaded={(u) => setImagesText((t) => (t.trim() ? `${t.trim()}\n${u}` : u))}
            />
            {imagesText
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean)
              .map((url, idx) => (
                <span key={url + idx} style={{ position: "relative", display: "inline-flex" }}>
                  <LibraryMedia url={url} style={thumbStyle} />
                  <button
                    type="button"
                    title="Xóa"
                    onClick={() =>
                      setImagesText((t) =>
                        t
                          .split("\n")
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .filter((_, i) => i !== idx)
                          .join("\n"),
                      )
                    }
                    style={removeChip}
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>


        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Video (YouTube hoặc URL mp4)</span>
          <input
            style={input}
            placeholder="https://youtu.be/... hoặc https://.../video.mp4"
            value={c.video_url}
            onChange={(e) => set("video_url", e.target.value)}
          />
        </label>

        <h3 style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 800 }}>
          🧩 Các phần / bước nội dung
        </h3>
        <p style={{ margin: 0, opacity: 0.65, fontSize: 12.5 }}>
          Thành viên xem lần lượt từng phần (Tiếp → / ← Quay lại). Nếu chưa tạo phần nào, website
          vẫn hiển thị Tiêu đề + Nội dung ở trên như hiện tại.
        </p>

        {c.sections.length === 0 && (
          <div
            style={{
              padding: 18,
              borderRadius: 14,
              border: "1px dashed rgba(120,120,140,0.4)",
              textAlign: "center",
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            Chưa có phần nào. Bấm “➕ Thêm phần mới” để tạo Phần 1 (VD: “FWB là gì?”).
          </div>
        )}

        {c.sections.map((s, i) => {
          const open = openMap[s.id] ?? false;
          return (
            <div
              key={s.id}
              style={{
                borderRadius: 14,
                border: "1px solid rgba(120,120,140,0.28)",
                background: "rgba(130,130,160,0.05)",
                overflow: "hidden",
                opacity: s.enabled ? 1 : 0.62,
              }}
            >
              {/* ── Đầu thẻ: icon + tiêu đề + hành động ── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: open ? "1px solid rgba(120,120,140,0.22)" : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenMap((m) => ({ ...m, [s.id]: !open }))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 0,
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.6, width: 14 }}>{open ? "▾" : "▸"}</span>
                  {s.icon_url ? (
                    <LibraryMedia url={s.icon_url} style={iconStyle} />
                  ) : (
                    <span style={{ ...iconStyle, display: "grid", placeItems: "center", fontSize: 15 }}>
                      🧩
                    </span>
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 11.5, opacity: 0.6, fontWeight: 700 }}>
                      Phần {i + 1}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.title.trim() || "(chưa có tiêu đề)"}
                    </span>
                  </span>
                </button>

                <label
                  title="Bật/tắt hiển thị"
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
                >
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => patchSection(i, { enabled: e.target.checked })}
                  />
                  <span style={{ opacity: 0.75 }}>Bật</span>
                </label>
                <button type="button" style={miniBtn} disabled={i === 0} onClick={() => moveSection(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  style={miniBtn}
                  disabled={i === c.sections.length - 1}
                  onClick={() => moveSection(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  style={{ ...miniBtn, color: "#e5484d", borderColor: "rgba(229,72,77,0.45)" }}
                  onClick={() => removeSection(i)}
                >
                  🗑
                </button>
              </div>

              {/* ── Nội dung mở rộng ── */}
              {open && (
                <div style={{ display: "grid", gap: 12, padding: 12 }}>
                  <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, opacity: 0.85 }}>Icon / GIF của phần</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <MediaUploadButton
                        compact
                        onUploaded={(u) => patchSection(i, { icon_url: u })}
                      />
                      {s.icon_url && (
                        <>
                          <LibraryMedia url={s.icon_url} style={thumbStyle} />
                          <button
                            type="button"
                            style={miniBtn}
                            onClick={() => patchSection(i, { icon_url: "" })}
                          >
                            Gỡ
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <input
                    style={input}
                    placeholder="Tiêu đề phần (VD: FWB là gì?)"
                    value={s.title}
                    onChange={(e) => patchSection(i, { title: e.target.value })}
                  />
                  <textarea
                    style={{ ...input, minHeight: 140, resize: "vertical", lineHeight: 1.6 }}
                    placeholder="Nội dung phần (cách 1 dòng trống để tách đoạn)"
                    value={s.body}
                    onChange={(e) => patchSection(i, { body: e.target.value })}
                  />

                  <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, opacity: 0.85 }}>Ảnh / GIF minh họa của phần</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <MediaUploadButton
                        compact
                        label="⬆️ Tải ảnh / GIF lên"
                        onUploaded={(u) => patchSection(i, { image_urls: [...s.image_urls, u] })}
                      />
                      {s.image_urls.map((url, idx) => (
                        <span key={url + idx} style={{ position: "relative", display: "inline-flex" }}>
                          <LibraryMedia url={url} style={thumbStyle} />
                          <button
                            type="button"
                            title="Xóa"
                            style={removeChip}
                            onClick={() =>
                              patchSection(i, {
                                image_urls: s.image_urls.filter((_, k) => k !== idx),
                              })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <input
                    style={input}
                    placeholder="Video của phần (YouTube hoặc URL mp4)"
                    value={s.video_url}
                    onChange={(e) => patchSection(i, { video_url: e.target.value })}
                  />
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            const s = emptySection();
            set("sections", [...c.sections, s]);
            setOpenMap((m) => ({ ...m, [s.id]: true }));
          }}
          style={{ ...input, width: "auto", padding: "9px 16px", cursor: "pointer", fontWeight: 700 }}
        >
          ➕ Thêm phần mới
        </button>

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
