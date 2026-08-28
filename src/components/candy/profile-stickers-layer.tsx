/**
 * <ProfileStickersLayer> — sticker trang trí bay quanh avatar hồ sơ.
 *
 * - Nguồn media: Kho "Quản Lý Icon VIP" (chỉ lưu id + url tham chiếu).
 * - Chỉ trang trí: pointer-events none, aria-hidden, không che avatar.
 * - Quỹ đạo: chỉ ở 2 cung TRÁI/PHẢI quanh avatar (±38°) nên KHÔNG tràn lên
 *   cover, KHÔNG đè xuống tên, và luôn cách mép avatar 20–40px.
 * - Hiệu ứng: CSS transform + opacity (lơ lửng chậm + glow nhẹ).
 */
import { useEffect, useMemo, useState } from "react";
import {
  PROFILE_STICKERS_EVENT,
  getCachedStickerCfg,
  loadStickerCfg,
  stickersForUser,
  type ProfileSticker,
  type ProfileStickerCfg,
  type StickerPos,
} from "@/lib/profile-stickers";

/** Cung cố định (độ) — chỉ quanh 2 bên avatar để không vượt cover / tên. */
const ANGLES: Record<Exclude<StickerPos, "random">, number> = {
  top: 270,
  "top-right": 312,
  right: 352,
  "bottom-right": 8,
  bottom: 270,
  "bottom-left": 172,
  left: 188,
  "top-left": 228,
};


function isVideo(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".webm") || clean.endsWith(".mp4");
}

export function useProfileStickers(userId?: string | null): ProfileSticker[] {
  const [cfg, setCfg] = useState<ProfileStickerCfg | null>(() => getCachedStickerCfg());

  useEffect(() => {
    let alive = true;
    void loadStickerCfg().then((c) => { if (alive) setCfg(c); });
    const onChange = () => setCfg(getCachedStickerCfg());
    window.addEventListener(PROFILE_STICKERS_EVENT, onChange);
    return () => { alive = false; window.removeEventListener(PROFILE_STICKERS_EVENT, onChange); };
  }, []);

  return stickersForUser(cfg, userId);
}

export function ProfileStickersLayer({ userId }: { userId?: string | null }) {
  const stickers = useProfileStickers(userId);
  // Random chỉ sau khi mount (tránh lệch SSR) → mỗi lần vào hồ sơ 1 bố cục khác.
  const [seed, setSeed] = useState(0);
  useEffect(() => { setSeed(Math.random()); }, [userId]);

  /**
   * Bố cục vòng cung quanh avatar:
   *  - Chỉ dùng cung TRÊN + 2 BÊN (165° → 375°): không xuống đáy nên không
   *    chạm tên và không chạm hàng nút bên dưới.
   *  - Khoảng cách góc luôn bằng nhau → không chồng, không dính.
   *  - Càng nhiều sticker → cỡ tự nhỏ lại; gap theo cỡ nên gần avatar mà
   *    vẫn không chạm avatar.
   */
  const layout = useMemo(() => {
    const n = stickers.length;
    const START = 165;
    const SWEEP = 210;
    const box = n <= 3 ? 36 : n <= 5 ? 32 : n <= 7 ? 28 : n <= 9 ? 25 : 22;
    // Cách mép avatar ~55% cạnh sticker → gần avatar nhưng không chạm.
    const gap = Math.round(box * 0.55);
    return stickers.map((s, i) => {
      const even = n === 1 ? START + SWEEP / 2 : START + (SWEEP / (n - 1)) * i;
      const deg = s.pos === "random" ? even : ANGLES[s.pos];
      const tilt = ((i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 2));
      return { s, deg, gap, tilt, i, box };
    });
  }, [stickers, seed]);


  if (!stickers.length) return null;

  return (
    <div className="pf-stickers" aria-hidden="true">
      {layout.map(({ s, deg, gap, tilt, i, box }) => {
        const rad = (deg * Math.PI) / 180;
        const glow = Math.max(0, Math.min(100, s.glow)) / 100;
        const style = {
          ["--pf-ux" as any]: `${Math.cos(rad).toFixed(3)}`,
          ["--pf-uy" as any]: `${Math.sin(rad).toFixed(3)}`,
          ["--pf-gap" as any]: `${gap.toFixed(1)}px`,
          ["--pf-tilt" as any]: `${tilt.toFixed(1)}deg`,
          ["--pf-dx" as any]: `${s.offsetX}px`,
          ["--pf-dy" as any]: `${s.offsetY}px`,
          ["--pf-scale" as any]: String(s.scale),
          ["--pf-delay" as any]: `${((i * 1.3) % 4).toFixed(2)}s`,
          ["--pf-dur" as any]: `${(6.5 + ((i * 0.9) % 3)).toFixed(2)}s`,
          ["--pf-glow" as any]: glow.toFixed(2),
          ["--pf-box" as any]: `${box}px`,
        } as React.CSSProperties;

        return (
          <span key={s.id} className="pf-sticker" style={style}>
            {isVideo(s.url) ? (
              <video src={s.url} autoPlay muted loop playsInline preload="metadata" />
            ) : (
              <img src={s.url} alt="" loading="lazy" decoding="async" draggable={false} />
            )}
          </span>
        );
      })}
    </div>
  );
}

export default ProfileStickersLayer;
