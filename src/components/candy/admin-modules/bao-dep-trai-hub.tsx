/**
 * Admin → "Bảo Đẹp Trai": Floating Dock · Theo Dõi · Sticker Trang Cá Nhân.
 */
import { useState } from "react";
import { FloatingDockManager } from "./floating-dock-manager";
import { ProfileStickerManager } from "./profile-sticker-manager";

type SubKey = "dock" | "follow" | "stickers";

const SUBS: { key: SubKey; label: string }[] = [
  { key: "dock", label: "Floating Dock" },
  { key: "follow", label: "Theo Dõi" },
  { key: "stickers", label: "Sticker Trang Cá Nhân" },
];

export function BaoDepTraiHub() {
  const [sub, setSub] = useState<SubKey>("dock");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SUBS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`choice-chip ${sub === s.key ? "is-active" : ""}`}
            onClick={() => setSub(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sub === "stickers" ? (
        <ProfileStickerManager />
      ) : (
        <FloatingDockManager section={sub} />
      )}
    </div>
  );
}

export default BaoDepTraiHub;
