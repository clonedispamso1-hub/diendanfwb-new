import { useState, type ReactNode } from "react";
import { X, Lock, Sparkles, Flame, Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { INTENT_OPTIONS, type Intent } from "@/lib/vn-provinces";

interface IntentPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPicked: (intent: Intent, lockedUntil: string) => void;
  forced?: boolean;
}

const ICON_MAP: Record<Intent, ReactNode> = {
  fwb:     <Sparkles size={22} />,
  ons:     <Flame size={22} />,
  serious: <Heart size={22} />,
  love:    <Heart size={22} />,
};


export function IntentPickerModal({ open, onClose, onPicked, forced }: IntentPickerModalProps) {
  const [busy, setBusy] = useState<Intent | null>(null);
  if (!open) return null;

  const pick = async (intent: Intent) => {
    setBusy(intent);
    try {
      const { data, error } = await supabase.rpc("set_intent_with_lock" as any, { p_intent: intent });
      if (error) {
        if ((error.message || "").includes("INTENT_LOCKED_UNTIL")) {
          toast.error("Nhu cầu của bạn đang bị khoá 24 giờ, chưa thể đổi.");
        } else {
          toast.error(error.message);
        }
        setBusy(null);
        return;
      }
      const lockedUntil = typeof data === "string" ? data : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      toast.success("Đã chọn nhu cầu — sẽ khoá trong 24 giờ.");
      onPicked(intent, lockedUntil);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi không xác định");
      setBusy(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => { if (!forced && !busy) onClose(); }}
      style={{ zIndex: 100 }}
    >
      <div
        className="modal-panel rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, padding: 24 }}
      >
        {!forced ? (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng"
            style={{ position: "absolute", top: 12, right: 12 }}
          >
            <X size={16} />
          </button>
        ) : null}

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 999,
              background: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Heart size={28} />
          </div>
          <h3 className="text-lg font-bold">Hôm nay bạn cần tìm mối quan hệ nào?</h3>
          <p className="text-sm text-muted-foreground" style={{ marginTop: 6 }}>
            Lựa chọn này sẽ <strong>khoá trong 24 giờ</strong> và hiển thị trên hồ sơ + bài viết của bạn.
          </p>
        </div>

        <div className="stack-sm">
          {INTENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={!!busy}
              onClick={() => void pick(opt.value)}
              className="rounded-3xl"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                cursor: busy ? "wait" : "pointer",
                opacity: busy && busy !== opt.value ? 0.5 : 1,
                transition: "all .2s",
                fontSize: 15,
                fontWeight: 600,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 40, height: 40, borderRadius: 999,
                  background: "hsl(var(--muted))",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {ICON_MAP[opt.value]}
              </span>
              <span style={{ flex: 1 }}>{opt.emoji} {opt.label}</span>
              {busy === opt.value ? <span className="text-xs text-muted-foreground">Đang lưu…</span> : null}
            </button>
          ))}
        </div>

        <p
          className="text-xs text-muted-foreground"
          style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", width: "100%" }}
        >
          <Lock size={12} /> Sau khi chọn, bạn không thể đổi trong 24 giờ.
        </p>
      </div>
    </div>
  );
}
