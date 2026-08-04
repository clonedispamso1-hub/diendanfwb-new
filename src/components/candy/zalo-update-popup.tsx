/**
 * Popup "Cập nhật Zalo" — hiện ĐÚNG 1 LẦN cho thành viên chưa từng cập nhật.
 *
 * Trạng thái (đã cập nhật / đã bỏ qua) lưu HOÀN TOÀN ở Supabase #2
 * (bảng public.user_zalo). Không ghi gì vào Supabase #1.
 * Không polling: chỉ 1 query khi đăng nhập xong.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { fetchUserZalo, isValidVnZalo, saveUserZalo } from "@/lib/site/db2-settings";
import { isSecondaryConfigured } from "@/integrations/supabase/secondary-client";

export function ZaloUpdatePopup() {
  const { session, ready } = useAuth();
  const userId = session?.user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !userId || !isSecondaryConfigured) return;
    let alive = true;
    void (async () => {
      try {
        const row = await fetchUserZalo(userId);
        if (!alive) return;
        if (!row) setOpen(true);
      } catch {
        /* lỗi mạng → không làm phiền người dùng */
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, userId]);

  if (!open || !userId || typeof document === "undefined") return null;

  const close = () => setOpen(false);

  const skip = async () => {
    setBusy(true);
    try {
      await saveUserZalo(userId, { phone: null, skipped: true });
      close();
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được, thử lại sau.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const value = phone.trim();
    if (!isValidVnZalo(value)) {
      toast.error("Số Zalo phải là số Việt Nam gồm 10 số, bắt đầu bằng 0.");
      return;
    }
    setBusy(true);
    try {
      await saveUserZalo(userId, { phone: value, skipped: false });
      toast.success("Đã cập nhật số Zalo.");
      close();
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được, thử lại sau.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="ui-modal-overlay" role="dialog" aria-modal="true" aria-label="Cập nhật Zalo">
      <div className="ui-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ui-modal-close" onClick={skip} aria-label="Đóng">
          <X size={16} />
        </button>

        <div className="ui-modal-icon" aria-hidden="true">
          <Phone size={26} />
        </div>

        <h2>Cập nhật Zalo</h2>
        <p>
          Bạn có muốn cập nhật số Zalo
          <br />
          để người khác có thể kết bạn với bạn không?
        </p>

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric"
          maxLength={10}
          placeholder="Số Zalo (10 số)"
          style={{
            width: "100%",
            marginTop: 14,
            padding: "11px 13px",
            borderRadius: 12,
            border: "1px solid var(--ui-modal-border)",
            background: "var(--ui-chip-bg)",
            color: "var(--ui-text)",
            fontSize: 15,
            textAlign: "center",
          }}
        />

        <div className="ui-modal-actions">
          <button
            type="button"
            className="ui-modal-btn ui-modal-btn--secondary"
            onClick={submit}
            disabled={busy}
          >
            🟢 Cập nhật
          </button>
          <button
            type="button"
            className="ui-modal-btn ui-modal-btn--ghost"
            onClick={skip}
            disabled={busy}
          >
            ⚪ Bỏ qua
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ZaloUpdatePopup;
