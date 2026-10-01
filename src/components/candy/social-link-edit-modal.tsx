/**
 * SocialLinkEditModal — popup nhỏ gọn để chủ profile thêm/sửa/xóa 1 liên kết MXH.
 * Chỉ dùng cho profile của chính mình (profile-uid-badge kiểm tra isOwn).
 * Lưu trực tiếp vào cột tương ứng trên bảng profiles (không tạo bảng mới).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/db/router";
import { Portal } from "@/components/candy/portal";
import "@/styles/social-link-modal.css";

export type SocialKey = "zalo" | "facebook" | "telegram" | "instagram" | "x";

export const SOCIAL_COLUMN: Record<SocialKey, string> = {
  zalo: "zalo",
  facebook: "facebook",
  telegram: "telegram",
  instagram: "instagram",
  x: "x",
};

export const SOCIAL_TITLE: Record<SocialKey, string> = {
  zalo: "Zalo",
  facebook: "Facebook",
  telegram: "Telegram",
  instagram: "Instagram",
  x: "X",
};

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  zalo: "Số điện thoại Zalo",
  facebook: "URL Facebook",
  telegram: "Username Telegram",
  instagram: "Username Instagram",
  x: "Username X",
};

export const SOCIAL_PLACEHOLDER: Record<SocialKey, string> = {
  zalo: "Nhập số điện thoại Zalo",
  facebook: "https://facebook.com/...",
  telegram: "@username",
  instagram: "username",
  x: "username",
};

function normalizeAndValidate(key: SocialKey, raw: string): { value?: string; error?: string } {
  const v = raw.trim();
  if (!v) return { error: "Vui lòng nhập thông tin." };

  if (key === "zalo") {
    const phone = v.replace(/[\s.-]/g, "");
    if (/^\+?\d{8,15}$/.test(phone)) return { value: phone };
    return { error: "Nhập số điện thoại Zalo hợp lệ." };
  }

  if (key === "facebook") {
    try {
      const url = new URL(v);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.protocol === "https:" && (hostname === "facebook.com" || hostname.endsWith(".facebook.com"))) {
        return { value: url.toString() };
      }
    } catch {
      // Hiển thị lỗi định dạng bên dưới.
    }
    return { error: "Nhập URL Facebook hợp lệ bắt đầu bằng https://." };
  }

  const username = v.replace(/^@/, "");
  if (key === "telegram") {
    if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) return { value: `@${username}` };
    return { error: "Username Telegram gồm 5–32 ký tự, bắt đầu bằng chữ cái." };
  }
  if (key === "instagram") {
    if (/^(?!.*\.\.)[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(username)) {
      return { value: username };
    }
    return { error: "Username Instagram không hợp lệ." };
  }
  if (/^[A-Za-z0-9_]{1,15}$/.test(username)) return { value: username };
  return { error: "Username X gồm 1–15 chữ cái, số hoặc dấu gạch dưới." };
}

interface Props {
  socialKey: SocialKey;
  userId: string;
  currentValue: string;
  onClose: () => void;
  /** Gọi sau khi lưu/xóa thành công — value = "" nghĩa là đã xóa liên kết. */
  onSaved: (column: string, value: string) => void;
}

export function SocialLinkEditModal({
  socialKey,
  userId,
  currentValue,
  onClose,
  onSaved,
}: Props) {
  const [value, setValue] = useState(currentValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const column = SOCIAL_COLUMN[socialKey];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const write = async (next: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("profiles")
      .update({ [column]: next || null } as any)
      .eq("id", userId);
    setBusy(false);
    if (err) {
      const msg = err.message || "";
      setError(
        /does not exist|schema cache/i.test(msg)
          ? `Chưa có trường "${column}" trong cơ sở dữ liệu — cần chạy SQL bổ sung.`
          : msg || "Không lưu được, thử lại nhé.",
      );
      return;
    }
    onSaved(column, next);
    onClose();
  };

  const handleSave = () => {
    const result = normalizeAndValidate(socialKey, value);
    if (result.error || !result.value) {
      setError(result.error ?? "Thông tin không hợp lệ.");
      return;
    }
    void write(result.value);
  };

  return (
    <Portal>
      <div className="slm-backdrop" role="presentation" onMouseDown={onClose}>
        <div
          className="slm-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`slm-title-${socialKey}`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h3 className="slm-title" id={`slm-title-${socialKey}`}>{SOCIAL_TITLE[socialKey]}</h3>
          <label className="slm-label" htmlFor={`slm-${socialKey}`}>
            {SOCIAL_LABEL[socialKey]}
          </label>
          <input
            id={`slm-${socialKey}`}
            className="slm-input"
            value={value}
            autoFocus
            maxLength={socialKey === "facebook" ? 300 : 40}
            inputMode={socialKey === "zalo" ? "tel" : socialKey === "facebook" ? "url" : "text"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={SOCIAL_PLACEHOLDER[socialKey]}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          {error ? <p className="slm-error" role="alert">{error}</p> : null}

          <div className="slm-actions">
            <button type="button" className="slm-btn slm-btn--ghost" onClick={onClose} disabled={busy}>
              Hủy
            </button>
            <button type="button" className="slm-btn slm-btn--primary" onClick={handleSave} disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>

          {currentValue ? (
            confirmDelete ? (
              <div className="slm-confirm">
                <span>Xóa liên kết này?</span>
                <button type="button" className="slm-link" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Không
                </button>
                <button type="button" className="slm-link slm-link--danger" onClick={() => void write("")} disabled={busy}>
                  Xóa
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="slm-link slm-link--danger slm-remove"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Xóa liên kết
              </button>
            )
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

export default SocialLinkEditModal;
