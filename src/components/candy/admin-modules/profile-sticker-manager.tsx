/**
 * Admin → "Bảo Đẹp Trai" → Sticker Trang Cá Nhân.
 * Upload GIF / PNG (APNG) / WebP animation, cấu hình glow · scale · offset · vị trí · bật-tắt.
 * Lưu trong admin_site_settings key = `profile_stickers` (không tạo bảng mới).
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, Upload } from "lucide-react";
import { uploadFeedbackImage } from "@/lib/feedback-media";
import {
  EMPTY_STICKER_CFG,
  loadStickerCfg,
  newSticker,
  saveStickerCfg,
  type ProfileSticker,
  type ProfileStickerCfg,
  type StickerPos,
} from "@/lib/profile-stickers";

const POS_LABEL: Record<StickerPos, string> = {
  random: "Ngẫu nhiên",
  "top-left": "Góc trái trên",
  top: "Trên avatar",
  "top-right": "Góc phải trên",
  left: "Bên trái",
  right: "Bên phải",
  "bottom-left": "Góc trái dưới",
  bottom: "Dưới avatar",
  "bottom-right": "Góc phải dưới",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--border, rgba(0,0,0,0.15))",
  background: "var(--background, #fff)",
  color: "var(--foreground, #111)",
  fontSize: 13.5,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>{label}</span>
      {children}
    </label>
  );
}

function StickerCard({
  item,
  onChange,
  onRemove,
}: {
  item: ProfileSticker;
  onChange: (p: Partial<ProfileSticker>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const { imageUrl } = await uploadFeedbackImage(file);
      onChange({ url: imageUrl });
      toast.success("Đã tải sticker lên");
    } catch (e: any) {
      toast.error(e?.message || "Tải lên thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      style={{
        borderRadius: 14,
        padding: 12,
        border: "1px solid var(--border, rgba(0,0,0,0.12))",
        background: "var(--card, rgba(255,255,255,0.04))",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: 12, flex: "0 0 auto",
            display: "grid", placeItems: "center",
            border: "1px dashed var(--border, rgba(0,0,0,0.2))",
            backgroundImage:
              "linear-gradient(45deg,rgba(128,128,128,.15) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.15) 75%),linear-gradient(45deg,rgba(128,128,128,.15) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.15) 75%)",
            backgroundSize: "12px 12px",
            backgroundPosition: "0 0, 6px 6px",
          }}
        >
          {item.url ? (
            <img loading="lazy" decoding="async" src={item.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 11, opacity: 0.6 }}>Trống</span>
          )}
        </div>
        <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 0 }}>
          <Field label="Tên">
            <input style={inputStyle} value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="URL ảnh (GIF · PNG/APNG · WebP)">
            <input style={inputStyle} value={item.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif,image/png,image/webp,image/apng,image/*"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <button type="button" className="choice-chip" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> {busy ? "Đang tải…" : "Tải ảnh lên"}
        </button>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={item.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          Bật
        </label>
        <button type="button" className="choice-chip" onClick={onRemove} style={{ marginLeft: "auto" }}>
          <Trash2 size={14} /> Xoá
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Field label={`Độ sáng Glow: ${item.glow}`}>
          <input type="range" min={0} max={100} step={5} value={item.glow} onChange={(e) => onChange({ glow: Number(e.target.value) })} />
        </Field>
        <Field label={`Scale: ${item.scale.toFixed(2)}×`}>
          <input type="range" min={0.3} max={2.5} step={0.05} value={item.scale} onChange={(e) => onChange({ scale: Number(e.target.value) })} />
        </Field>
        <Field label={`Offset X: ${item.offsetX}px`}>
          <input type="range" min={-120} max={120} step={2} value={item.offsetX} onChange={(e) => onChange({ offsetX: Number(e.target.value) })} />
        </Field>
        <Field label={`Offset Y: ${item.offsetY}px`}>
          <input type="range" min={-120} max={120} step={2} value={item.offsetY} onChange={(e) => onChange({ offsetY: Number(e.target.value) })} />
        </Field>
        <Field label="Vị trí quanh avatar">
          <select style={inputStyle} value={item.pos} onChange={(e) => onChange({ pos: e.target.value as StickerPos })}>
            {(Object.keys(POS_LABEL) as StickerPos[]).map((p) => (
              <option key={p} value={p}>{POS_LABEL[p]}</option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}

export function ProfileStickerManager() {
  const [cfg, setCfg] = useState<ProfileStickerCfg>(EMPTY_STICKER_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadStickerCfg(true).then((c) => { setCfg(c); setLoading(false); });
  }, []);

  const patchItem = (id: string, p: Partial<ProfileSticker>) =>
    setCfg((c) => ({ ...c, items: c.items.map((it) => (it.id === id ? { ...it, ...p } : it)) }));

  const save = async () => {
    setSaving(true);
    try {
      await saveStickerCfg(cfg);
      toast.success("Đã lưu thư viện sticker");
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ opacity: 0.7 }}>Đang tải thư viện sticker…</p>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12.5, opacity: 0.75 }}>
        Sticker chỉ upload 1 lần và dùng chung. Mỗi tài khoản chỉ tham chiếu ID sticker
        (chọn trong trang sửa tài khoản) — không nhân bản dữ liệu.
      </p>

      <button
        type="button"
        className="choice-chip"
        style={{ justifySelf: "start" }}
        onClick={() => setCfg((c) => ({ ...c, items: [...c.items, newSticker()] }))}
      >
        <Plus size={14} /> Thêm sticker
      </button>

      {cfg.items.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 13 }}>Chưa có sticker nào.</p>
      ) : (
        cfg.items.map((it) => (
          <StickerCard
            key={it.id}
            item={it}
            onChange={(p) => patchItem(it.id, p)}
            onRemove={() =>
              setCfg((c) => ({
                ...c,
                items: c.items.filter((x) => x.id !== it.id),
                assign: Object.fromEntries(
                  Object.entries(c.assign)
                    .map(([uid, ids]) => [uid, ids.filter((x) => x !== it.id)] as const)
                    .filter(([, ids]) => ids.length),
                ),
              }))
            }
          />
        ))
      )}

      <button type="button" className="choice-chip is-active" style={{ justifySelf: "start" }} onClick={() => void save()} disabled={saving}>
        <Save size={14} /> {saving ? "Đang lưu…" : "Lưu thư viện"}
      </button>
    </div>
  );
}

export default ProfileStickerManager;
