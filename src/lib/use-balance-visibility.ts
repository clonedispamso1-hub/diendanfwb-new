/**
 * V6 — Trạng thái ẩn/hiện số dư ví (mặc định ẩn), lưu localStorage.
 * Dùng chung cho header + popup ví để 2 nơi luôn đồng bộ.
 */
import { useCallback, useEffect, useState } from "react";

const LS_KEY = "fwbvn.wallet.balance-shown.v1";
const EVENT = "wallet:balance-visibility";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function useBalanceVisibility() {
  // Mặc định luôn ẩn (kể cả SSR) → tránh hydration mismatch.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(read());
    const sync = () => setShown(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !read();
    try {
      window.localStorage.setItem(LS_KEY, next ? "1" : "0");
    } catch {
      /* noop */
    }
    setShown(next);
    try {
      window.dispatchEvent(new CustomEvent(EVENT));
    } catch {
      /* noop */
    }
  }, []);

  return { shown, toggle };
}

/** Chuỗi che số dư khi đang ẩn. */
export const MASKED_BALANCE = "xxxxxxxx";
