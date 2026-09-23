/**
 * Cờ "đang ở tab Album" — dùng để ẩn icon Zalo nổi CHỈ trên trang Album.
 * Tab Album nằm cùng route "/" với Feed nên không thể phân biệt bằng pathname.
 */
import { useEffect, useState } from "react";

let active = false;
const listeners = new Set<(v: boolean) => void>();

export function setAlbumTabActive(v: boolean) {
  if (active === v) return;
  active = v;
  listeners.forEach((fn) => fn(v));
}

export function isAlbumTabActive() {
  return active;
}

export function useAlbumTabActive(): boolean {
  const [value, setValue] = useState(active);
  useEffect(() => {
    setValue(active);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
