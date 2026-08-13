import { avatarSrc } from "@/lib/image-cdn";
import { motion } from "framer-motion";
import { Skull, Zap } from "lucide-react";

interface Actor {
  name: string;
  avatar: string | null;
}

interface Props {
  reporter: Actor;
  target: Actor;
  compact?: boolean;
}

function Avatar({ src, name, side }: { src: string | null; name: string; side: "left" | "right" }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative h-24 w-24 rounded-full ring-2 ${
          side === "left" ? "ring-rose-500/70" : "ring-rose-400/40"
        } overflow-hidden bg-neutral-900 shadow-[0_0_30px_rgba(244,63,94,0.35)]`}
      >
        {src ? (
          <img loading="lazy" decoding="async" src={src} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-2xl font-bold text-rose-300">
            {initial}
          </div>
        )}
      </div>
      <div className="text-xs font-semibold text-rose-200/90 max-w-[7rem] truncate text-center">
        {name || "—"}
      </div>
    </div>
  );
}

/**
 * Hiệu ứng "tấn công" khi gửi tố cáo.
 * - Avatar reporter bên trái, target bên phải
 * - Tia laser đỏ neon bắn từ trái sang phải
 * - Target rung + fade out khi trúng đòn
 */
export function ReportAttackOverlay({ reporter, target, compact = false }: Props) {
  return (
    <div className={`relative flex items-center justify-between gap-2 ${compact ? "px-1 py-5 min-h-[178px]" : "px-4 py-10 min-h-[260px]"}`}>
      {/* Reporter */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="z-10"
      >
        <Avatar src={avatarSrc(reporter.avatar, 64)} name={reporter.name} side="left" />
        <div className="mt-1 text-[10px] uppercase tracking-widest text-rose-400/80 text-center">
          Bạn
        </div>
      </motion.div>

      {/* Laser beam */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
        <div className="relative w-[60%] h-[6px]">
          {/* Charge glow at source */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.4, 0.9], opacity: [0, 1, 0.6] }}
            transition={{ duration: 0.45, times: [0, 0.6, 1] }}
            className="absolute -left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-rose-500 blur-xl"
          />
          {/* Beam */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.35, ease: "easeOut" }}
            style={{ transformOrigin: "left center" }}
            className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-500 via-pink-400 to-fuchsia-300 shadow-[0_0_24px_4px_rgba(244,63,94,0.85)]"
          />
          {/* Sparks at impact */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.6, 1.2], opacity: [0, 1, 0] }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="absolute -right-6 top-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-rose-400 blur-2xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.4, 1], rotate: [0, 30, -10] }}
            transition={{ delay: 0.75, duration: 0.6 }}
            className="absolute -right-8 top-1/2 -translate-y-1/2 text-rose-200"
          >
            <Zap size={28} strokeWidth={2.5} />
          </motion.div>
        </div>
      </div>

      {/* Target */}
      <motion.div
        initial={{ x: 20, opacity: 1 }}
        animate={{
          x: [20, 0, -6, 6, -4, 4, 0],
          opacity: [1, 1, 1, 1, 0.6, 0.3, 0.15],
          filter: [
            "drop-shadow(0 0 0 rgba(244,63,94,0))",
            "drop-shadow(0 0 0 rgba(244,63,94,0))",
            "drop-shadow(0 0 12px rgba(244,63,94,0.7))",
            "drop-shadow(0 0 18px rgba(244,63,94,0.9))",
            "drop-shadow(0 0 8px rgba(244,63,94,0.5))",
            "drop-shadow(0 0 0 rgba(244,63,94,0))",
            "grayscale(1)",
          ] as unknown as string[],
        }}
        transition={{ duration: 1.1, times: [0, 0.55, 0.62, 0.7, 0.8, 0.9, 1] }}
        className="z-10 relative"
      >
        <Avatar src={avatarSrc(target.avatar, 64)} name={target.name} side="right" />
        <div className="mt-1 text-[10px] uppercase tracking-widest text-rose-400/80 text-center">
          Đối tượng
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 1, 0.8], scale: [0.4, 1.2, 1, 1] }}
          transition={{ delay: 0.85, duration: 0.6 }}
          className="absolute -top-2 -right-2 rounded-full bg-rose-600/90 p-1.5 shadow-[0_0_18px_rgba(244,63,94,0.9)]"
        >
          <Skull size={16} className="text-white" />
        </motion.div>
      </motion.div>

      {/* Scan lines for cyberpunk feel */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 4px)",
        }}
      />
    </div>
  );
}
