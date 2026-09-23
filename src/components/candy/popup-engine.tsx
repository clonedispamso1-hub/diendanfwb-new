/**
 * POPUP ENGINE — cầu nối tới POPUP DUY NHẤT `CommonLockedPopup`.
 *
 * API cũ giữ nguyên:
 *   openPopup("vip_zalo");
 *   openPopup("live_moc", { onConfirm, onClose });
 *
 * Toàn bộ nội dung (icon, tiêu đề, nội dung, quyền lợi, text/màu nút, link hỗ trợ)
 * lấy từ Admin Panel → "Quản lý Popup Chung". Không còn giao diện popup riêng.
 */
import { useEffect, useState } from "react";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";

const EVENT = "candy:open-popup";

export interface OpenPopupOptions {
  /** Giữ tương thích API cũ — KHÔNG còn ghi đè nội dung popup. */
  overrides?: Record<string, unknown>;
  onConfirm?: () => void;
  onClose?: () => void;
  /** Tên tính năng hiển thị (tuỳ chọn). */
  featureName?: string;
  /** Ghi đè biến thể popup; mặc định suy ra từ `key`. */
  variant?: string;
}

/**
 * Suy ra `variant` từ popup_key để CommonLockedPopup render đúng CTA.
 * vd: "vip_zalo" / "zalo_friend" → "zalo".
 */
export function variantFromKey(key: string): string | undefined {
  const k = (key || "").toLowerCase();
  if (k.includes("zalo")) return "zalo";
  if (k.includes("phone") || k.includes("sodienthoai")) return "phone";
  if (k.includes("live")) return "live";
  return undefined;
}

interface OpenDetail extends OpenPopupOptions {
  key: string;
}

/** Mở popup chung theo tên tính năng. */
export function openPopup(key: string, options: OpenPopupOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenDetail>(EVENT, { detail: { key, ...options } }));
}

/** Đóng popup đang mở. */
export function closePopup() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("candy:close-popup"));
}

export function PopupEngine() {
  const [current, setCurrent] = useState<OpenDetail | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      if (!detail?.key) return;
      setCurrent(detail);
    };
    const onClose = () => setCurrent(null);
    window.addEventListener(EVENT, onOpen as EventListener);
    window.addEventListener("candy:close-popup", onClose);
    return () => {
      window.removeEventListener(EVENT, onOpen as EventListener);
      window.removeEventListener("candy:close-popup", onClose);
    };
  }, []);

  const close = () => {
    current?.onClose?.();
    setCurrent(null);
  };

  return (
    <CommonLockedPopup
      open={Boolean(current)}
      featureName={current?.featureName}
      variant={current ? (current.variant ?? variantFromKey(current.key)) : undefined}
      onClose={close}
    />
  );
}

export default PopupEngine;
