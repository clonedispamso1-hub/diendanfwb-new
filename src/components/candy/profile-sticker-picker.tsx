/**
 * <ProfileStickerPicker> — chọn Sticker trang cá nhân cho 1 tài khoản.
 *
 * Nguồn DUY NHẤT: kho "Quản Lý Icon VIP (Media VIP)" (bảng `vip_icons`).
 * Không có thư viện riêng, không upload ở đây — chỉ lưu id của media VIP.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { loadStickerCfg, saveUserStickers, ensureStickerFromVipIcon } from "@/lib/profile-stickers";
import { fetchVipIcons, VIP_DEFAULT_FOLDER, type VipIcon } from "@/lib/vip-assets";
import { MediaItem } from "@/components/admin-v3/MediaItem";

export function ProfileStickerPicker({ userId }: { userId: string }) {
  const [icons, setIcons] = useState<VipIcon[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");

  useEffect(() => {
    let alive = true;
    void loadStickerCfg(true).then((cfg) => {
      if (alive) setSelected((cfg.assign[userId] ?? [])[0] ?? null);
    });
    void fetchVipIcons({ activeOnly: true })
      .then((list) => { if (alive) setIcons(list); })
      .catch(() => { if (alive) setIcons([]); });
    return () => { alive = false; };
  }, [userId]);

  const folders = useMemo(
    () => Array.from(new Set((icons ?? []).map((i) => i.folder || VIP_DEFAULT_FOLDER))),
    [icons],
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (icons ?? []).filter(
      (i) =>
        (!term || (i.name || "").toLowerCase().includes(term)) &&
        (!folder || (i.folder || VIP_DEFAULT_FOLDER) === folder),
    );
  }, [icons, q, folder]);

  const pick = async (icon: VipIcon) => {
    setSaving(true);
    try {
      if (selected === icon.id) {
        await saveUserStickers(userId, []);
        setSelected(null);
        toast.success("Đã bỏ sticker trang cá nhân");
      } else {
        await ensureStickerFromVipIcon(icon);
        await saveUserStickers(userId, [icon.id]);
        setSelected(icon.id);
        toast.success("Đã gán sticker cho hồ sơ");
      }
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pf-sticker-picker">
      <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>
        ✨ Sticker Trang Cá Nhân <span style={{ opacity: 0.6, fontWeight: 500 }}>(từ kho Icon VIP)</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          className="gs-input"
          style={{ flex: "1 1 140px", padding: "6px 10px", fontSize: 12 }}
          placeholder="Tìm media VIP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="gs-input"
          style={{ flex: "0 0 auto", padding: "6px 10px", fontSize: 12 }}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">Tất cả thư mục</option>
          {folders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {icons == null ? (
        <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.7, display: "flex", gap: 6 }}>
          <Loader2 size={14} className="gs-spin" /> Đang tải kho Icon VIP…
        </p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.7 }}>
          Kho Icon VIP đang trống. Vào “Quản Lý Icon VIP (Media VIP)” để tải media lên.
        </p>
      ) : (
        <div className="pf-sticker-picker-grid">
          {visible.map((ic) => (
            <button
              key={ic.id}
              type="button"
              className="pf-sticker-picker-item"
              data-on={selected === ic.id ? "1" : "0"}
              disabled={saving}
              onClick={() => void pick(ic)}
              title={selected === ic.id ? "Bấm để bỏ chọn" : "Chọn làm sticker hồ sơ"}
            >
              <MediaItem url={ic.url} alt={ic.name} />
              <span>{ic.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProfileStickerPicker;
