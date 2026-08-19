/**
 * PHASE 4.0 — Màn quét "Tìm quanh đây" 3 bước.
 *
 * B1 (Scanning): Mini map zoom, radar quét, avatar dots pop dần.
 * B2 (Counter):  Hiển thị lần lượt 4 dòng cảm xúc với counter animate tăng số.
 *                ❤️ X online · 🔥 X muốn kết nối · 💖 X phù hợp · ✨ X mới
 * B3 (Found):    "Tìm thấy X người phù hợp" trước khi chuyển sang danh sách.
 *
 * Tổng ~3.5–4s. KHÔNG đụng SQL / logic Nearby.
 */

import { useEffect, useMemo, useState } from "react";
import { Sparkles, MapPin, Heart, Flame, Users } from "lucide-react";

interface Props {
  city: string | null;
  avatars: string[];
  countOnline: number;
  countTotal: number;
  countWants?: number;  // muốn kết nối hôm nay (proxy: tổng hoặc tuỳ caller)
  countNew?: number;    // thành viên mới hôm nay
  countMatch?: number;  // phù hợp với mình
  onDone: () => void;
}

type Phase = "scanning" | "counter" | "found";

const PINK = "#ec4899";
const PURPLE = "#a855f7";

const SCAN_MS = 2500;
const COUNTER_MS = 3000;
const FOUND_MS = 1200;
const FADE_MS = 250;

/** Counter tăng từ 0 -> value trong khoảng `duration` ms. */
function useTicker(value: number, duration = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value <= 0) { setN(0); return; }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // ease-out
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

function StatLine({
  icon, label, value, accent, delay,
}: { icon: string; label: string; value: number; accent: string; delay: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  const n = useTicker(show ? value : 0, 650);
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border bg-card/80 px-4 py-2.5 shadow-sm backdrop-blur"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(6px)",
        transition: "opacity .35s ease, transform .35s ease",
        borderColor: show ? `${accent}33` : undefined,
      }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg shadow"
        style={{ background: `linear-gradient(135deg, ${accent}, ${PURPLE})` }}
      >
        <span>{icon}</span>
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="text-base font-extrabold leading-tight text-foreground">
          {n}<span className="ml-0.5 text-xs font-bold text-muted-foreground">người</span>
        </div>
      </div>
    </div>
  );
}

export function NearbyScanIntro({
  city, avatars, countOnline, countTotal, countWants, countNew, countMatch, onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Phase 1 → fade → Phase 2
    const f1 = window.setTimeout(() => setFading(true), SCAN_MS - FADE_MS);
    const t1 = window.setTimeout(() => { setPhase("counter"); setFading(false); }, SCAN_MS);
    // Phase 2 → fade → Phase 3
    const f2 = window.setTimeout(() => setFading(true), SCAN_MS + COUNTER_MS - FADE_MS);
    const t2 = window.setTimeout(() => { setPhase("found"); setFading(false); }, SCAN_MS + COUNTER_MS);
    // Phase 3 fully done → onDone
    const t3 = window.setTimeout(onDone, SCAN_MS + COUNTER_MS + FOUND_MS);
    return () => {
      window.clearTimeout(f1); window.clearTimeout(t1);
      window.clearTimeout(f2); window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDone]);

  const wants = countWants ?? Math.max(0, countTotal - countOnline + Math.floor(countTotal / 3));
  const fresh = countNew ?? Math.max(0, Math.floor(countTotal / 4));
  const match = countMatch ?? Math.max(0, Math.floor(countTotal * 0.6));
  const foundN = useTicker(phase === "found" ? Math.max(countTotal, match) : 0, 500);

  const dots = useMemo(() => {
    const pool = avatars.slice(0, 8);
    const positions = [
      { left: "18%", top: "28%" }, { left: "70%", top: "20%" },
      { left: "82%", top: "58%" }, { left: "62%", top: "80%" },
      { left: "22%", top: "70%" }, { left: "44%", top: "16%" },
      { left: "10%", top: "50%" }, { left: "90%", top: "40%" },
    ];
    return positions.map((p, i) => ({
      ...p, src: pool[i] || null, delay: 0.15 + i * 0.12,
    }));
  }, [avatars]);

  return (
    <div className="grid min-h-[68vh] place-items-center px-4">
      <div
        className="flex w-full max-w-sm flex-col items-center text-center"
        style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}
      >
        {phase === "scanning" ? (
          <>
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-rose-500">
              <MapPin className="h-3.5 w-3.5" />
              <span>{city || "Khu vực của bạn"}</span>
            </div>

            <div
              className="nearby-map-zoom relative grid h-72 w-72 place-items-center overflow-hidden rounded-[2rem] border shadow-xl"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(244,114,182,.18), rgba(168,85,247,.10) 55%, transparent 75%), linear-gradient(135deg, #fff1f7 0%, #faf0ff 60%, #f3e8ff 100%)",
                boxShadow: "0 30px 60px -20px rgba(236,72,153,.35)",
              }}
            >
              <svg className="absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
                <defs>
                  <pattern id="np-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M24 0 L0 0 0 24" fill="none" stroke="rgba(168,85,247,.18)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#np-grid)" />
              </svg>

              <span className="absolute h-20 w-20 rounded-full"
                style={{ background: `radial-gradient(circle, ${PINK}33 0%, transparent 70%)`,
                  animation: "nearby-radar-pulse 1.4s ease-out infinite" }} />
              <span className="absolute h-20 w-20 rounded-full"
                style={{ background: `radial-gradient(circle, ${PURPLE}33 0%, transparent 70%)`,
                  animation: "nearby-radar-pulse 1.4s ease-out infinite .45s" }} />

              <div className="absolute h-48 w-48 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, transparent 0deg, ${PINK}66 30deg, transparent 60deg)`,
                  animation: "nearby-radar-spin 1.8s linear infinite",
                  maskImage: "radial-gradient(circle, black 60%, transparent 70%)",
                  WebkitMaskImage: "radial-gradient(circle, black 60%, transparent 70%)",
                }} />

              <div
                className="relative z-10 grid h-12 w-12 place-items-center rounded-full text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
                  boxShadow: `0 8px 22px ${PINK}66` }}
              >
                <Heart className="h-5 w-5 fill-white" />
              </div>

              {dots.map((d, i) => (
                <div key={i} className="absolute" style={{
                  left: d.left, top: d.top, transform: "translate(-50%, -50%)",
                  animation: `nearby-dot-pop .5s ease-out ${d.delay}s both`,
                }}>
                  <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-rose-300">
                    {d.src ? <img decoding="async" src={d.src} alt="" className="h-full w-full object-cover" loading="lazy" />
                           : <span className="text-base">💞</span>}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-rose-500" />
              📍 Đang quét khu vực của bạn...
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Tìm những người dễ thương quanh bạn</p>
          </>
        ) : phase === "counter" ? (
          <div className="nearby-counter-in flex w-full flex-col gap-2.5">
            <h2 className="mb-1 text-sm font-bold text-muted-foreground">Cập nhật quanh bạn</h2>
            <StatLine icon="❤️" label="Đang online gần bạn" value={countOnline} accent="#22c55e" delay={0} />
            <StatLine icon="🔥" label="Muốn kết nối hôm nay" value={wants}       accent="#f97316" delay={250} />
            <StatLine icon="💖" label="Phù hợp với bạn"      value={match}       accent={PINK}    delay={500} />
            <StatLine icon="✨" label="Thành viên mới hôm nay" value={fresh}      accent={PURPLE}  delay={750} />
          </div>
        ) : (
          <div className="nearby-counter-in flex flex-col items-center">
            <div className="grid h-24 w-24 place-items-center rounded-full text-4xl shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
                boxShadow: `0 20px 50px -10px ${PINK}aa` }}>
              <Users className="h-10 w-10 text-white" />
            </div>
            <h2 className="mt-5 text-2xl font-extrabold leading-tight text-foreground">
              Tìm thấy <span className="text-rose-500">{foundN}</span> người phù hợp
            </h2>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-rose-500" />
              Cùng khám phá ngay nào
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default NearbyScanIntro;
