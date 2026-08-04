/**
 * Admin — Quản lý bong bóng nổi (Nhóm Zalo + Fanpage).
 * Đổi icon / màu / tiêu đề / link + Ẩn / Hiện. Ghi vào admin_site_settings
 * key = 'floating_bubbles' và phát sự kiện để web cập nhật realtime.
 */
import { useEffect, useState } from "react";
import { Save, Loader2, ExternalLink, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { adminSetSiteSetting } from "@/lib/admin-db";

type BubbleCfg = { enabled: boolean; title: string; url: string; icon: string; color: string };
type Cfg = { enabled: boolean; zalo: BubbleCfg; facebook: BubbleCfg };

const DEFAULT: Cfg = {
  enabled: true,
  zalo: { enabled: true, title: "Nhóm Zalo", url: "https://zalo.me/", icon: "📱", color: "#0068ff" },
  facebook: { enabled: true, title: "Fanpage Admin", url: "https://facebook.com/", icon: "👍", color: "#1877f2" },
};
const ICON_PRESETS = ["📱", "👍", "💬", "❤️", "🔥", "⭐", "🎁", "🌸", "🌟", "🚀", "✨", "🪄"];
const COLOR_PRESETS = ["#0068ff", "#1877f2", "#00b14f", "#22c55e", "#f43f5e", "#f59e0b", "#8b5cf6", "#0ea5e9", "#111827"];

export function FloatingBubblesManager() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("get_site_setting", { _key: "floating_bubbles" });
        if (data && typeof data === "object") {
          setCfg({
            enabled: data.enabled ?? true,
            zalo: { ...DEFAULT.zalo, ...(data.zalo ?? {}) },
            facebook: { ...DEFAULT.facebook, ...(data.facebook ?? {}) },
          });
        }
      } finally { setLoading(false); }
    })();
  }, []);

  async function save(next: Cfg = cfg) {
    setSaving(true);
    try {
      await adminSetSiteSetting("floating_bubbles", next);
      toast.success("Đã lưu bong bóng nổi");
      window.dispatchEvent(new CustomEvent("floating-bubbles:changed"));
      try { localStorage.removeItem("fwbvn.floating-bubble.reset"); } catch { /* noop */ }
    } catch (e: any) { toast.error(e?.message || "Lưu thất bại"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Đang tải…</div>;

  const renderRow = (key: "zalo" | "facebook", label: string) => {
    const b = cfg[key];
    const update = (patch: Partial<BubbleCfg>) => setCfg({ ...cfg, [key]: { ...b, ...patch } });
    const isImg = /^https?:\/\//i.test(b.icon);
    return (
      <div className="admv3-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl text-white"
              style={{ background: b.color, boxShadow: `0 8px 20px -8px ${b.color}` }}
            >
              {isImg ? <img loading="lazy" decoding="async" src={b.icon} alt="" className="h-7 w-7 rounded-full object-cover" /> : b.icon}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{label}</div>
              <div className="truncate text-xs text-muted-foreground">{b.title}</div>
            </div>
          </div>
          <button
            type="button"
            className="admv3-btn admv3-btn-ghost inline-flex items-center gap-1"
            onClick={() => update({ enabled: !b.enabled })}
          >
            {b.enabled ? <><Eye size={14} /> Đang hiện</> : <><EyeOff size={14} /> Đang ẩn</>}
          </button>
        </div>

        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Tiêu đề</div>
          <input className="admv3-input" value={b.title} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Liên kết <ExternalLink size={11} /></div>
          <input className="admv3-input" value={b.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://…" />
        </label>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Icon (emoji hoặc URL ảnh)</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {ICON_PRESETS.map((i) => (
              <button key={i} type="button" className={`admv3-btn admv3-btn-ghost ${b.icon === i ? "!bg-primary/20" : ""}`} onClick={() => update({ icon: i })}>{i}</button>
            ))}
          </div>
          <input className="admv3-input" value={b.icon} onChange={(e) => update({ icon: e.target.value })} placeholder="📱 hoặc https://…/icon.png" />
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Màu nền</div>
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Màu ${c}`}
                onClick={() => update({ color: c })}
                className="h-7 w-7 rounded-full border-2"
                style={{ background: c, borderColor: b.color === c ? "hsl(var(--foreground))" : "transparent" }}
              />
            ))}
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#1877f2"}
              onChange={(e) => update({ color: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
              aria-label="Chọn màu tuỳ ý"
            />
            <input className="admv3-input flex-1 min-w-[120px]" value={b.color} onChange={(e) => update({ color: e.target.value })} placeholder="#1877f2" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="admv3-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">Quản lý liên kết nổi</div>
          <div className="text-xs text-muted-foreground">Bong bóng nổi góc phải web. Đổi link → user thấy lại ngay cả khi đã đóng lần trước.</div>
        </div>
        <button
          type="button"
          className="admv3-btn admv3-btn-ghost inline-flex items-center gap-1"
          onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
        >
          {cfg.enabled ? <><Eye size={14} /> Bật toàn bộ</> : <><EyeOff size={14} /> Tắt toàn bộ</>}
        </button>
      </div>
      {renderRow("facebook", "Fanpage Admin")}
      {renderRow("zalo", "Nhóm Zalo")}
      <div className="flex justify-end">
        <button className="admv3-btn" onClick={() => save()} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
        </button>
      </div>
    </div>
  );
}
