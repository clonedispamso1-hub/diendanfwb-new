import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render children vào document.body để thoát khỏi mọi stacking context
 * (transform, filter, will-change…) của cha. Dùng cho modal/popup quan trọng.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
