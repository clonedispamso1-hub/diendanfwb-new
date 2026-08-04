import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { X, Heart, Moon, HeartHandshake, ShieldCheck, Ban, Crown, Sparkles, ArrowRight, Check } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { Button } from "@/components/ui/button";

interface VipZaloGuideProps {
  open: boolean;
  onClose: () => void;
}

type Step = {
  key: string;
  render: () => React.ReactNode;
};

export function VipZaloGuide({ open, onClose }: VipZaloGuideProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const steps: Step[] = [
    {
      key: "welcome",
      render: () => (
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[26px] bg-gradient-to-br from-pink-100 to-rose-50 text-4xl shadow-inner">
            💖
          </div>
          <h2 className="text-[24px] font-extrabold tracking-tight text-rose-950">
            Welcome to VIP Zalo
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-rose-900/70">
            Before using this community, please take a few minutes to understand
            how the platform works and what each relationship means. This helps
            everyone have a better and safer experience.
          </p>
        </div>
      ),
    },
    {
      key: "relationships",
      render: () => (
        <div>
          <h2 className="text-center text-[22px] font-extrabold tracking-tight text-rose-950">
            Understand relationships
          </h2>
          <p className="mt-1 text-center text-[13px] text-rose-900/60">
            Three common types on VIP Zalo
          </p>
          <div className="mt-5 space-y-3">
            <RelCard
              icon={<Heart className="h-5 w-5" />}
              tint="from-pink-100 to-rose-50 text-rose-600"
              title="💕 FWB — Friends With Benefits"
              points={[
                "Two adults voluntarily agree.",
                "No commitment is required.",
                "Respect and honesty are important.",
                "Both sides can stop at any time.",
              ]}
            />
            <RelCard
              icon={<Moon className="h-5 w-5" />}
              tint="from-purple-100 to-pink-50 text-purple-600"
              title="🌙 ONS — One Night Stand"
              points={[
                "Usually lasts only one meeting.",
                "Everything must be voluntary.",
                "Respect each other's privacy.",
                "Never force or pressure anyone.",
              ]}
            />
            <RelCard
              icon={<HeartHandshake className="h-5 w-5" />}
              tint="from-rose-100 to-red-50 text-rose-700"
              title="❤️ Serious Relationship"
              points={[
                "For dating or long-term partners.",
                "Honesty and respect are encouraged.",
              ]}
            />
          </div>
        </div>
      ),
    },
    {
      key: "rules",
      render: () => (
        <div>
          <h2 className="text-center text-[22px] font-extrabold tracking-tight text-rose-950">
            📜 Community Guidelines
          </h2>
          <p className="mt-1 text-center text-[13px] text-rose-900/60">
            Keep it kind, safe, and honest
          </p>
          <div className="mt-5 grid gap-2.5">
            {[
              "Respect everyone.",
              "Do not spam.",
              "No scams or fraud.",
              "No harassment.",
              "Respect privacy.",
              "Do not publish other people's personal information.",
              "Meet responsibly and safely.",
            ].map((r) => (
              <RuleRow key={r} text={r} kind="do" />
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "prohibited",
      render: () => (
        <div>
          <h2 className="text-center text-[22px] font-extrabold tracking-tight text-rose-950">
            🚫 Prohibited
          </h2>
          <p className="mt-1 text-center text-[13px] text-rose-900/60">
            These behaviors lead to a permanent ban
          </p>
          <div className="mt-5 grid gap-2.5">
            {[
              "Threatening others.",
              "Blackmail.",
              "Impersonation.",
              "Selling illegal products.",
              "Posting violent or illegal content.",
              "Sharing private information without permission.",
            ].map((r) => (
              <RuleRow key={r} text={r} kind="dont" />
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "benefits",
      render: () => (
        <div>
          <h2 className="text-center text-[22px] font-extrabold tracking-tight text-rose-950">
            ⭐ VIP Member Benefits
          </h2>
          <p className="mt-1 text-center text-[13px] text-rose-900/60">
            What you unlock as a VIP
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3">
            <BenefitCard emoji="👀" title="Higher profile visibility" desc="Get seen by more members every day." />
            <BenefitCard emoji="👑" title="VIP badge" desc="Show your status with a premium badge." />
            <BenefitCard emoji="🔝" title="Priority in search" desc="Appear near the top of search results." />
            <BenefitCard emoji="💬" title="More daily interactions" desc="Higher limits for likes and messages." />
            <BenefitCard emoji="✨" title="Future premium features" desc="Early access to upcoming tools." />
          </div>
        </div>
      ),
    },
    {
      key: "done",
      render: () => (
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-pink-100 to-rose-50 text-5xl shadow-inner">
            🎉
          </div>
          <h2 className="text-[24px] font-extrabold tracking-tight text-rose-950">
            Thank you!
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-rose-900/70">
            Thank you for reading the Community Guidelines. We hope you enjoy a
            safe and respectful experience on VIP Zalo.
          </p>
        </div>
      ),
    },
  ];

  const total = steps.length;
  const isLast = index === total - 1;
  const isFirst = index === 0;

  const ctaLabel = (() => {
    if (isFirst) return "Continue";
    if (steps[index].key === "relationships") return "I Understand";
    if (isLast) return "Start Exploring";
    return "Continue";
  })();

  return (
    <AnimatePresence>
      {open ? (
        <Portal>
          <motion.div
            key="vipzalo-bd"
            className="fixed inset-0 z-[10090] grid place-items-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: "rgba(80, 20, 45, 0.35)",
              backdropFilter: "blur(14px) saturate(150%)",
              WebkitBackdropFilter: "blur(14px) saturate(150%)",
            }}
            onClick={onClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="vipzalo-title"
              key="vipzalo-panel"
              className="relative flex w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-b from-white to-rose-50/40 shadow-2xl"
              style={{ maxHeight: "92vh" }}
              initial={{ opacity: 0, y: 26, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="relative flex items-center justify-between px-5 pb-3 pt-4">
                <div className="flex items-center gap-2 text-rose-600">
                  <Crown size={18} />
                  <span id="vipzalo-title" className="text-[13px] font-bold tracking-wide">
                    VIP ZALO
                  </span>
                  <Sparkles size={14} className="text-pink-400" />
                </div>
                <div className="text-[12px] font-semibold text-rose-500/80">
                  {index + 1}/{total}
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-rose-500 shadow-sm transition hover:bg-white"
                  style={{ transform: "translate(0, -2px)" }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Progress */}
              <div className="px-5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500"
                    initial={false}
                    animate={{ width: `${((index + 1) / total) * 100}%` }}
                    transition={{ type: "spring", stiffness: 200, damping: 26 }}
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 pb-4 pt-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={steps[index].key}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  >
                    {steps[index].render()}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 border-t border-rose-100/70 bg-white/70 px-5 py-4 backdrop-blur">
                {!isFirst ? (
                  <Button
                    variant="outline"
                    className="h-11 flex-1 rounded-2xl border-rose-200 bg-white font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  >
                    Back
                  </Button>
                ) : null}
                <Button
                  className="h-11 flex-[2] rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 font-bold text-white shadow-lg shadow-rose-200 hover:from-pink-600 hover:to-rose-600"
                  onClick={() => {
                    if (isLast) onClose();
                    else setIndex((i) => Math.min(total - 1, i + 1));
                  }}
                >
                  <span>{ctaLabel}</span>
                  {!isLast ? <ArrowRight size={16} className="ml-1" /> : null}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </Portal>
      ) : null}
    </AnimatePresence>
  );
}

function RelCard({
  icon,
  title,
  points,
  tint,
}: {
  icon: React.ReactNode;
  title: string;
  points: string[];
  tint: string;
}) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${tint}`}>
          {icon}
        </div>
        <h3 className="text-[15px] font-bold text-rose-950">{title}</h3>
      </div>
      <ul className="mt-3 space-y-1.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-rose-900/75">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-rose-300" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleRow({ text, kind }: { text: string; kind: "do" | "dont" }) {
  const isDo = kind === "do";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 shadow-sm">
      <div
        className={`grid h-8 w-8 place-items-center rounded-full ${
          isDo ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
        }`}
      >
        {isDo ? <Check size={16} /> : <Ban size={16} />}
      </div>
      <p className="text-[14px] font-medium text-rose-950/85">{text}</p>
    </div>
  );
}

function BenefitCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-pink-50/60 p-4 shadow-sm">
      <div className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-2xl shadow-inner">
        {emoji}
      </div>
      <div>
        <h4 className="text-[14.5px] font-bold text-rose-950">{title}</h4>
        <p className="mt-0.5 text-[13px] leading-relaxed text-rose-900/65">{desc}</p>
      </div>
    </div>
  );
}

// Keep unused import friendly for tree-shakers who scan text.
void ShieldCheck;
