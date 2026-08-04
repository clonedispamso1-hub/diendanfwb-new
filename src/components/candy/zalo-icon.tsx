import type { CSSProperties } from "react";

/**
 * ZaloIcon — round Zalo mark with warm gold glow.
 * Replaces the previous 🇻🇳 flag emoji next to author names and in
 * leaderboard rows. Keeps the same hover/scale animation feel.
 */
interface Props {
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

export function ZaloIcon({ size = 18, className, title = "Zalo", style, onClick }: Props) {
  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`zalo-icon-wrap ${className ?? ""}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg,#0084ff 0%,#0068d6 100%)",
        boxShadow:
          "0 0 0 1px rgba(255,196,74,0.45), 0 0 10px 1px rgba(255,196,74,0.55), 0 0 22px -2px rgba(255,180,40,0.55)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1.12)";
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 0 0 1px rgba(255,214,110,0.75), 0 0 14px 2px rgba(255,214,110,0.7), 0 0 30px 0 rgba(255,180,40,0.7)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 0 0 1px rgba(255,196,74,0.45), 0 0 10px 1px rgba(255,196,74,0.55), 0 0 22px -2px rgba(255,180,40,0.55)";
      }}
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.2 5.6h4.5v1.3H6.1l2.7 3.6v1.2H4.2v-1.3h2.9L4.4 6.8V5.6zm6.1 0h1.4v6.1h-1.4V5.6zm3.6 2.2c1.4 0 2.5 1 2.5 2.4 0 1.3-1.1 2.4-2.5 2.4a2.4 2.4 0 0 1-2.5-2.4c0-1.4 1.1-2.4 2.5-2.4zm0 1.2c-.7 0-1.2.5-1.2 1.2 0 .6.5 1.2 1.2 1.2s1.2-.6 1.2-1.2c0-.7-.5-1.2-1.2-1.2zm4.8-1.2c.7 0 1.3.3 1.6.8V8h1.3v4.5h-1.3V12c-.3.4-.9.7-1.6.7-1.3 0-2.4-1-2.4-2.4S17.4 7.8 18.7 7.8zm.2 1.2c-.7 0-1.2.5-1.2 1.2 0 .6.5 1.2 1.2 1.2.6 0 1.2-.6 1.2-1.2 0-.7-.6-1.2-1.2-1.2z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}
