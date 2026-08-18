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
  top: -34,
  "top-right": -30,
  right: 0,
  "bottom-right": 30,
  bottom: 34,
  "bottom-left": 150,
  left: 180,
  "top-left": -150,
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

  const layout = useMemo(() => {
    const rnd = (i: number, salt: number) => {
      const x = Math.sin((i + 1) * 12.9898 + seed * 78.233 + salt) * 43758.5453;
      return x - Math.floor(x);
    };
    return stickers.map((s, i) => {
      const side = i % 2 === 0 ? 1 : -1;                 // phải / trái xen kẽ
      const spread = (rnd(i, 1) - 0.5) * 2;              // -1..1
      const jitter = spread * 38;                        // ±38° quanh trục ngang
      const base = s.pos === "random" ? (side > 0 ? 0 : 180) : ANGLES[s.pos];
      const deg = base + (side > 0 ? jitter : -jitter);
      // Khoảng cách tính từ TÂM avatar: bán kính avatar (~50%) + 20–40px
      const gap = 20 + rnd(i, 2) * 20;
      const tilt = (rnd(i, 3) - 0.5) * 16;               // nghiêng nhẹ
      return { s, deg, gap, tilt, i };
    });
  }, [stickers, seed]);

  if (!stickers.length) return null;

  return (
    <div className="pf-stickers" aria-hidden="true">
      {layout.map(({ s, deg, gap, tilt, i }) => {
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
