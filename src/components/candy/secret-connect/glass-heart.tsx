/**
 * GlassHeart — trái tim pha lê 3D cho ❤️ Kết Nối Bí Mật V3.
 * Chỉ CSS keyframes + transform/opacity/blur/gradient/box-shadow.
 * Không ThreeJS / Canvas / WebGL / Lottie.
 */
import { useMemo } from "react";

export type HeartEnergy = "calm" | "search" | "sending" | "match";

export function GlassHeart({
  energy = "calm",
  size = 220,
}: {
  energy?: HeartEnergy;
  size?: number;
}) {
  const motes = useMemo(
    () =>
      Array.from({ length: 12 }, () => ({
        left: `${Math.round(Math.random() * 90 + 5)}%`,
        dx: `${Math.round((Math.random() - 0.5) * 70)}px`,
        s: `${(Math.random() * 5 + 6).toFixed(1)}px`,
        dur: `${(Math.random() * 3 + 4).toFixed(1)}s`,
        delay: `${(Math.random() * 4).toFixed(1)}s`,
      })),
    [],
  );

  return (
    <div
      className={`gh gh--${energy}`}
      style={{ "--gh-size": `${size}px` } as React.CSSProperties}
      aria-hidden
    >
      <span className="gh__aura" />
      <span className="gh__led gh__led--a" />
      <span className="gh__led gh__led--b" />
      <span className="gh__led gh__led--c" />
      <span className="gh__wave" />
      <span className="gh__wave gh__wave--2" />
      <div className="gh__body">
        <span className="gh__shape" />
        <span className="gh__facet" />
        <span className="gh__gloss" />
        <span className="gh__sweep" />
      </div>
      <span className="gh__motes">
        {motes.map((m, i) => (
          <i
            key={i}
            style={
              {
                left: m.left,
                "--dx": m.dx,
                "--s": m.s,
                "--d": m.dur,
                animationDelay: m.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </span>
    </div>
  );
}

export default GlassHeart;
