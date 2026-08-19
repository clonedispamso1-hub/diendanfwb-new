/**
 * Admin → "Bảo Đẹp Trai" → cấu hình Floating Dock (icon nổi mé phải).
 * Ghi qua adminSetSiteSetting('floating_dock').
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Save, Upload } from "lucide-react";
import { uploadFeedbackImage } from "@/lib/feedback-media";
import {
  DOCK_DEFAULT,
  loadDockCfg,
  saveDockCfg,
  type DockCfg,
  type DockItemId,
} from "@/lib/floating-dock-config";

const ITEM_LABEL: Record<DockItemId, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  gamexu: "Game Xu",
  follow: "Theo dõi",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid var(--border, rgba(0,0,0,0.15))",
  background: "var(--background, #fff)",
  color: "var(--foreground, #111)",
  fontSize: 14,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.75 }}>{label}</span>
      {children}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        borderRadius: 16,
        padding: 16,
        border: "1px solid var(--border, rgba(0,0,0,0.12))",
        background: "var(--card, rgba(255,255,255,0.04))",
        display: "grid",
        gap: 12,
      }}
    >
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h4>
      {children}
    </section>
  );
}

/** Chọn icon: nhập URL/emoji hoặc upload ảnh. */
function IconField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isImg = /^(https?:\/\/|data:image\/)/i.test(value);

  const pick = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const { imageUrl } = await uploadFeedbackImage(file);
      onChange(imageUrl);
      toast.success("Đã tải icon lên");
    } catch (e: any) {
      toast.error(e?.message || "Tải icon thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span
          style={{
            width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center",
            background: "#fff", border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden", fontSize: 20,
          }}
        >
          {isImg ? <img loading="lazy" decoding="async" src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : (value || "—")}
        </span>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Emoji hoặc URL ảnh"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        <label className="choice-chip" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
          <Upload size={13} /> {busy ? "Đang tải…" : "Upload"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy}
            onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ""; }}
          />
        </label>
        {value ? (
          <button type="button" className="choice-chip" onClick={() => onChange("")}>Xoá</button>
        ) : null}
      </div>
    </Field>
  );
}

export function FloatingDockManager({ section = "all" }: { section?: "all" | "dock" | "follow" } = {}) {
  const showDock = section !== "follow";
  const showFollow = section !== "dock";
  const [cfg, setCfg] = useState<DockCfg>(DOCK_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadDockCfg().then((c) => { setCfg(c); setLoading(false); });
  }, []);

  const patch = (p: Partial<DockCfg>) => setCfg((c) => ({ ...c, ...p }));
  const patchFb = (p: Partial<DockCfg["facebook"]>) =>
    setCfg((c) => ({ ...c, facebook: { ...c.facebook, ...p } }));
  const patchZalo = (p: Partial<DockCfg["zalo"]>) =>
    setCfg((c) => ({ ...c, zalo: { ...c.zalo, ...p } }));
  const patchGame = (p: Partial<DockCfg["gamexu"]>) =>
    setCfg((c) => ({ ...c, gamexu: { ...c.gamexu, ...p } }));
  const patchFollow = (p: Partial<DockCfg["follow"]>) =>
    setCfg((c) => ({ ...c, follow: { ...c.follow, ...p } }));

  const move = (i: number, dir: -1 | 1) => {
    setCfg((c) => {
      const order = [...c.order];
      const j = i + dir;
      if (j < 0 || j >= order.length) return c;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...c, order };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveDockCfg(cfg);
      toast.success("Đã lưu Floating Dock");
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ opacity: 0.7 }}>Đang tải cấu hình…</p>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {showDock ? (
      <>
      <Card title="Floating Dock">
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          Bật Floating Dock
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={cfg.visible} onChange={(e) => patch({ visible: e.target.checked })} />
          Hiện trên website
        </label>

        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>
          Dock cố định mé phải, hiển thị 3 ô trắng (Facebook · Zalo · Game Xu). Không kéo thả.
        </p>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.75 }}>Thứ tự icon</span>
          {cfg.order.map((id, i) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontWeight: 700 }}>{i + 1}. {ITEM_LABEL[id]}</span>
              <button type="button" className="choice-chip" onClick={() => move(i, -1)} aria-label="Lên">
                <ArrowUp size={13} />
              </button>
              <button type="button" className="choice-chip" onClick={() => move(i, 1)} aria-label="Xuống">
                <ArrowDown size={13} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Facebook">
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={cfg.facebook.enabled} onChange={(e) => patchFb({ enabled: e.target.checked })} />
          Bật icon Facebook
        </label>
        <Field label="Tên Fanpage">
          <input style={inputStyle} value={cfg.facebook.name} onChange={(e) => patchFb({ name: e.target.value })} />
        </Field>
        <Field label="Link Fanpage (dán link)">
          <input style={inputStyle} placeholder="https://facebook.com/..." value={cfg.facebook.url} onChange={(e) => patchFb({ url: e.target.value.trim() })} />
        </Field>
        <Field label="Ảnh đại diện Fanpage (URL)">
          <input style={inputStyle} placeholder="https://..." value={cfg.facebook.avatar} onChange={(e) => patchFb({ avatar: e.target.value.trim() })} />
        </Field>
        <IconField label="Icon Facebook (upload ảnh hoặc URL/emoji)" value={cfg.facebook.icon} onChange={(v) => patchFb({ icon: v })} />
        <Field label="Màu">
          <input type="color" value={cfg.facebook.color} onChange={(e) => patchFb({ color: e.target.value })} />
        </Field>
      </Card>

      <Card title="Zalo">
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={cfg.zalo.enabled} onChange={(e) => patchZalo({ enabled: e.target.checked })} />
          Bật icon Zalo
        </label>
        <Field label="Chế độ">
          <select style={inputStyle} value={cfg.zalo.mode} onChange={(e) => patchZalo({ mode: e.target.value as DockCfg["zalo"]["mode"] })}>
            <option value="chat">Chỉ Chat Zalo</option>
            <option value="group">Chỉ Group Zalo</option>
            <option value="both">Cả hai</option>
          </select>
        </Field>
        <Field label="Tên hiển thị">
          <input style={inputStyle} value={cfg.zalo.name} onChange={(e) => patchZalo({ name: e.target.value })} />
        </Field>
        <Field label="Link Chat Zalo">
          <input style={inputStyle} placeholder="https://zalo.me/..." value={cfg.zalo.chatUrl} onChange={(e) => patchZalo({ chatUrl: e.target.value.trim() })} />
        </Field>
        <Field label="Link Group Zalo">
          <input style={inputStyle} placeholder="https://zalo.me/g/..." value={cfg.zalo.groupUrl} onChange={(e) => patchZalo({ groupUrl: e.target.value.trim() })} />
        </Field>
        <Field label="Avatar (URL)">
          <input style={inputStyle} value={cfg.zalo.avatar} onChange={(e) => patchZalo({ avatar: e.target.value.trim() })} />
        </Field>
        <Field label="Ảnh QR (URL)">
          <input style={inputStyle} value={cfg.zalo.qr} onChange={(e) => patchZalo({ qr: e.target.value.trim() })} />
        </Field>
        <IconField label="Icon Zalo (upload ảnh hoặc URL/emoji)" value={cfg.zalo.icon} onChange={(v) => patchZalo({ icon: v })} />
        <Field label="Màu">
          <input type="color" value={cfg.zalo.color} onChange={(e) => patchZalo({ color: e.target.value })} />
        </Field>
      </Card>

      <Card title="Game Xu">
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={cfg.gamexu.enabled} onChange={(e) => patchGame({ enabled: e.target.checked })} />
          Bật icon Game Xu
        </label>
        <Field label="Nhãn">
          <input style={inputStyle} value={cfg.gamexu.label} onChange={(e) => patchGame({ label: e.target.value })} />
        </Field>
        <IconField label="Icon Game Xu (upload ảnh hoặc URL/emoji)" value={cfg.gamexu.icon} onChange={(v) => patchGame({ icon: v })} />
        <Field label="Màu">
          <input type="color" value={cfg.gamexu.color} onChange={(e) => patchGame({ color: e.target.value })} />
        </Field>
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>
          Click icon Game Xu sẽ mở thẳng trang Rút tiền (không popup).
        </p>
      </Card>

      </>
      ) : null}

      {showFollow ? (
      <Card title="Theo dõi">
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={cfg.follow.enabled}
            onChange={(e) => patchFollow({ enabled: e.target.checked })}
          />
          Bật icon Theo dõi
        </label>
        <Field label="Nhãn">
          <input style={inputStyle} value={cfg.follow.label} onChange={(e) => patchFollow({ label: e.target.value })} />
        </Field>
        <IconField
          label="Icon Theo dõi (upload ảnh hoặc URL/emoji)"
          value={cfg.follow.icon}
          onChange={(v) => patchFollow({ icon: v })}
        />
        <Field label={`Kích thước icon: ${cfg.follow.size}px`}>
          <input
            type="range"
            min={36}
            max={88}
            step={2}
            value={cfg.follow.size}
            onChange={(e) => patchFollow({ size: Number(e.target.value) })}
          />
        </Field>
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>
          Vị trí hiển thị chỉnh ở mục “Thứ tự icon” phía trên. Badge đỏ hiện số người theo dõi mới
          trong 24 giờ và tự mất khi mở danh sách.
        </p>
      </Card>
      ) : null}

      <button type="button" className="choice-chip is-active" onClick={() => void save()} disabled={saving}>
        <Save size={14} /> {saving ? "Đang lưu…" : "Lưu cấu hình"}
      </button>
    </div>
  );
}

export default FloatingDockManager;
