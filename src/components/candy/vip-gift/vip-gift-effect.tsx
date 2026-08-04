import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Portal } from "@/components/candy/portal";
import type { VipGift } from "./vip-gift-data";
import { formatGem } from "./vip-gift-data";
import {
  detectBasePerfMode,
  gemToEffectTier,
  sampleFps,
  type EffectTier,
  type PerfMode,
} from "@/lib/perf-mode";

interface Props {
  gift: VipGift | null;
  senderName: string;
  recipientName: string;
  onDone: () => void;
}

const TIER_DURATION: Record<EffectTier, number> = {
  light: 1600,
  mid: 2400,
  premium: 3800,
  celebration: 6000,
};

const TIER_PARTICLES: Record<EffectTier, number> = {
  light: 0,
  mid: 18,
  premium: 36,
  celebration: 60,
};

const TIER_EMOJI_SIZE: Record<EffectTier, string> = {
  light: "min(22vw, 160px)",
  mid: "min(28vw, 200px)",
  premium: "min(40vw, 280px)",
  celebration: "min(50vw, 360px)",
};

interface Particle {
  x: number;
  delay: number;
  dur: number;
  scale: number;
  glyph: string;
}

function buildParticles(count: number, tier: EffectTier, seed: string): Particle[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const glyphs =
    tier === "celebration" ? ["✨", "💫", "⭐", "🌟"] :
    tier === "premium" ? ["✨", "💎", "⭐"] :
    ["✨"];
  return Array.from({ length: count }, (_, i) => {
    h = Math.imul(h ^ i, 2654435761) >>> 0;
    const r1 = (h % 1000) / 1000;
    h = Math.imul(h ^ (i + 7), 40503) >>> 0;
    const r2 = (h % 1000) / 1000;
    h = Math.imul(h ^ (i + 13), 9176) >>> 0;
    const r3 = (h % 1000) / 1000;
    return {
      x: r1 * 100,
      delay: r2 * 0.6,
      dur: 1.4 + r3 * 1.4,
      scale: 0.7 + r3 * 0.9,
      glyph: glyphs[i % glyphs.length],
    };
  });
}

function VipGiftEffectImpl({ gift, senderName, recipientName, onDone }: Props) {
  // Perf tier dựa trên gem value + base perf mode + FPS sampler (chỉ chạy premium+)
  const [perfMode, setPerfMode] = useState<PerfMode>(() => detectBasePerfMode());
  const tier: EffectTier = useMemo(
    () => (gift ? gemToEffectTier(gift.gem, perfMode) : "light"),
    [gift, perfMode],
  );
  const samplerRan = useRef(false);

  // Auto-reduce: chỉ trigger khi gift mạnh (premium+); nếu FPS < 45 → hạ perfMode → tier hạ 1 bậc lần sau.
  useEffect(() => {
    if (!gift || samplerRan.current) return;
    const initialTier = gemToEffectTier(gift.gem, "high");
    if (initialTier !== "premium" && initialTier !== "celebration") return;
    samplerRan.current = true;
    let cancelled = false;
    void sampleFps(1500).then((fps) => {
      if (cancelled) return;
      if (fps < 45) setPerfMode("low");
    });
    return () => { cancelled = true; };
  }, [gift]);

  // Auto-dismiss
  useEffect(() => {
    if (!gift) return;
    const t = window.setTimeout(onDone, TIER_DURATION[tier]);
    return () => window.clearTimeout(t);
  }, [gift, tier, onDone]);

  // Camera shake chỉ cho celebration & không phải low mode
  useEffect(() => {
    if (!gift || tier !== "celebration") return;
    const root = document.documentElement;
    root.classList.add("vip-camera-shake");
    const t = window.setTimeout(() => root.classList.remove("vip-camera-shake"), 800);
    return () => {
      root.classList.remove("vip-camera-shake");
      window.clearTimeout(t);
    };
  }, [gift, tier]);

  const particles = useMemo(
    () => (gift ? buildParticles(TIER_PARTICLES[tier], tier, gift.id) : []),
    [gift, tier],
  );

  if (!gift) {
    return (
      <Portal>
        <AnimatePresence />
      </Portal>
    );
  }

  const showHalo = tier !== "light";
  const showStarfield = tier === "celebration";
  const showBanner = tier === "premium" || tier === "celebration";

  // Background nhẹ — không dùng backdrop blur khổng lồ
  const bg =
    tier === "celebration"
      ? "radial-gradient(ellipse at center, rgba(40,10,80,0.78), rgba(0,0,0,0.9))"
      : tier === "premium"
        ? "radial-gradient(ellipse at center, rgba(20,10,40,0.5), rgba(0,0,0,0.65))"
        : tier === "mid"
          ? "radial-gradient(ellipse at center, rgba(0,0,0,0.25), rgba(0,0,0,0.4))"
          : "transparent";

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          key={gift.id + "-" + tier}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10080,
            pointerEvents: "none",
            overflow: "hidden",
            background: bg,
            willChange: "opacity",
          }}
        >
          {showStarfield ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(2px 2px at 20% 30%, #fff, transparent), radial-gradient(1.5px 1.5px at 70% 60%, #c9a8ff, transparent), radial-gradient(2px 2px at 40% 80%, #fff, transparent), radial-gradient(1px 1px at 85% 25%, #7be5ff, transparent), radial-gradient(1.5px 1.5px at 15% 70%, #fff, transparent)",
                backgroundSize: "400px 400px",
                animation: "vip-stars-drift 10s linear infinite",
                opacity: 0.85,
                willChange: "background-position",
              }}
            />
          ) : null}

          {showHalo ? (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.2, 1], opacity: [0, 0.75, 0.5] }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: 480,
                height: 480,
                maxWidth: "85vw",
                maxHeight: "85vw",
                borderRadius: "50%",
                background: `radial-gradient(circle, ${gift.glow}99 0%, ${gift.glow}00 70%)`,
                willChange: "transform, opacity",
                transform: "translate3d(0,0,0)",
              }}
            />
          ) : null}

          {/* Main gift emoji — dùng transform thuần, không nested drop-shadow */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={
              tier === "celebration"
                ? { scale: [0, 1.15, 1, 1.08, 1], opacity: [0, 1, 1, 1, 0] }
                : tier === "premium"
                  ? { scale: [0, 1.2, 1.05], opacity: [0, 1, 0] }
                  : tier === "mid"
                    ? { scale: [0, 1.2, 1, 0.95], opacity: [0, 1, 1, 0] }
                    : { scale: [0, 1.1, 1, 0.9], opacity: [0, 1, 1, 0] }
            }
            transition={{ duration: TIER_DURATION[tier] / 1000, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: TIER_EMOJI_SIZE[tier],
              textShadow: showHalo ? `0 0 30px ${gift.glow}` : "none",
              willChange: "transform, opacity",
              transform: "translate3d(0,0,0)",
            }}
          >
            {gift.emoji}
          </motion.div>

          {/* Particles — CSS animation thuần qua transform */}
          {particles.length > 0 ? (
            <div style={{ position: "absolute", inset: 0 }}>
              {particles.map((p, i) => (
                <span
                  key={i}
                  className="vip-gift-particle"
                  style={
                    {
                      left: `${p.x}vw`,
                      bottom: 0,
                      fontSize: 22,
                      animationDelay: `${p.delay}s`,
                      animationDuration: `${p.dur}s`,
                      ["--vip-particle-scale" as any]: p.scale,
                      color: gift.glow,
                    } as CSSProperties
                  }
                >
                  {p.glyph}
                </span>
              ))}
            </div>
          ) : null}

          {showBanner ? (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 220, damping: 22 }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: "15%",
                textAlign: "center",
                padding: "0 24px",
                willChange: "transform, opacity",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, rgba(20,5,40,0.85), rgba(60,10,80,0.85))",
                  border: `1.5px solid ${gift.glow}`,
                  boxShadow: `0 0 22px ${gift.glow}aa`,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: 0.2,
                }}
              >
                🔥 <span style={{ color: gift.glow }}>{senderName}</span> vừa tặng{" "}
                <span style={{ color: gift.glow }}>{gift.name.toUpperCase()}</span>
                {recipientName ? ` cho ${recipientName}` : ""}
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                  💎 {formatGem(gift.gem)} GEM
                </div>
              </div>
            </motion.div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </Portal>
  );
}

export const VipGiftEffect = memo(VipGiftEffectImpl);
