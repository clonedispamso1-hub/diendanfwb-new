import { Sparkles } from "lucide-react";
import { findInterest } from "@/lib/fwb-interests";

interface Props {
  displayName: string;
  interests: string[];
  age?: number | null;
  city?: string | null;
}

/**
 * Banner độc lập hiển thị khi user đang ở "chế độ tài khoản FWB".
 * Dark + neon pink/fuchsia glow. Không thay thế header gốc — chèn phía trên.
 */
export function FwbModeBanner({ displayName, interests, age, city }: Props) {
  return (
    <div className="fwb-mode-banner relative overflow-hidden rounded-[18px] p-5 sm:p-6">
      <div className="fwb-mode-banner-glow" aria-hidden />
      <div className="relative z-[1]">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/20 border border-pink-400/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-pink-200 shadow-[0_0_12px_rgba(236,72,153,0.5)]">
            <Sparkles size={11} /> FWB Mode
          </span>
          {age ? (
            <span className="text-[11px] text-pink-200/80 font-semibold">
              {age} tuổi
            </span>
          ) : null}
          {city ? (
            <span className="text-[11px] text-pink-200/60">· {city}</span>
          ) : null}
        </div>
        <h2 className="text-white text-xl sm:text-2xl font-extrabold tracking-tight drop-shadow-[0_2px_12px_rgba(236,72,153,0.7)]">
          {displayName}
        </h2>
        <p className="text-[11px] text-white/60 mt-1">
          Tài khoản phụ — Tìm FWB · Riêng tư
        </p>
        {interests.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {interests.map((key) => {
              const i = findInterest(key);
              if (!i) return null;
              return (
                <span
                  key={key}
                  className="fwb-tag-neon inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  <span>{i.emoji}</span>
                  {i.label}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
