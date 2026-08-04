import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Shield } from "lucide-react";
import { toast } from "sonner";
import { Portal } from "@/components/candy/portal";
import { supabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  userId: string;
  onVerified: () => void;
}

const PHONE_RE = /^\d{10}$/;

function detectDevice(): "Mobile" | "Tablet" | "Desktop" {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "Mobile";
  return "Desktop";
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Khác";
}

export function PhoneVerifyModal({ open, userId, onVerified }: Props) {
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cleaned = phone.replace(/\s+/g, "");
    if (!PHONE_RE.test(cleaned)) {
      setErr("Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const nowIso = new Date().toISOString();
      const device = detectDevice();
      const browser = detectBrowser();
      const ua = navigator.userAgent;

      // Best-effort profile update — extra columns are optional.
      const updates: Record<string, unknown> = { phone: cleaned };
      // Try to set phone_verified / phone_verified_at if columns exist.
      updates.phone_verified = true;
      updates.phone_verified_at = nowIso;

      let { error } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (error) {
        // Fallback: schema without new columns.
        const { error: e2 } = await supabase
          .from("profiles")
          .update({ phone: cleaned })
          .eq("id", userId);
        if (e2) throw e2;
      }

      // Best-effort log to phone_verifications (ignore if table missing).
      try {
        await supabase.from("phone_verifications").insert({
          user_id: userId,
          phone: cleaned,
          device,
          browser,
          user_agent: ua,
          verified_at: nowIso,
        });
      } catch { /* table optional */ }

      // Local flag → popup never appears again on this device for this user.
      try {
        localStorage.setItem(`phone_verified:${userId}`, "1");
      } catch { /* ignore */ }

      toast.success("Đã xác minh số điện thoại.");
      onVerified();
    } catch (e: any) {
      setErr(e?.message ?? "Không thể lưu số điện thoại. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <Portal>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 10070,
              background: "rgba(15,23,42,0.55)", backdropFilter: "blur(8px)",
              display: "grid", placeItems: "center", padding: "24px 16px",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              style={{
                width: "100%", maxWidth: 380, background: "#fff",
                borderRadius: 24, padding: "26px 22px 22px",
                boxShadow: "0 30px 80px -12px rgba(15,23,42,0.4)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 68, height: 68, margin: "0 auto 14px",
                  borderRadius: 999, display: "grid", placeItems: "center",
                  background: "linear-gradient(135deg,#e0f0ff,#f0f7ff)",
                  color: "#0068ff",
                }}
              >
                <Phone size={30} />
              </div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#0f172a" }}>
                📱 Xác minh số điện thoại
              </h3>
              <p style={{ marginTop: 10, color: "#64748b", fontSize: 13.5, lineHeight: 1.55 }}>
                Để sử dụng tính năng <b>Tìm Zalo</b>, bạn cần cập nhật số điện thoại của mình.
              </p>
              <p style={{ marginTop: 6, color: "#94a3b8", fontSize: 12, lineHeight: 1.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Shield size={12} /> Số điện thoại chỉ dùng để xác minh, không hiển thị công khai.
              </p>

              <div style={{ marginTop: 18, textAlign: "left" }}>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  maxLength={10}
                  placeholder="Nhập số điện thoại (10 số)"
                  value={phone}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(v);
                    if (err) setErr(null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                  style={{
                    width: "100%", height: 48, borderRadius: 12,
                    padding: "0 14px", fontSize: 15, fontWeight: 600,
                    border: err ? "1.5px solid #ef4444" : "1.5px solid #e2e8f0",
                    outline: "none", color: "#0f172a",
                    letterSpacing: "0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
                {err ? (
                  <div style={{ marginTop: 8, color: "#ef4444", fontSize: 12.5, fontWeight: 600 }}>
                    {err}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 12 }}>
                    Ví dụ: 0912345678
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                style={{
                  marginTop: 18, height: 50, width: "100%", borderRadius: 14,
                  border: "none",
                  background: "linear-gradient(135deg,#0068ff,#33a3ff)",
                  color: "#fff", fontWeight: 800, fontSize: 15,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                  boxShadow: "0 12px 26px -10px rgba(0,104,255,0.55)",
                }}
              >
                {busy ? "Đang lưu..." : "Tiếp tục"}
              </button>
            </motion.div>
          </motion.div>
        </Portal>
      ) : null}
    </AnimatePresence>
  );
}

export default PhoneVerifyModal;