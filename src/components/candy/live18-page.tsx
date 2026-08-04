import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Video,
  Sparkles,
  Users,
  Star,
  Bell,
  PartyPopper,
  UserPlus,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  Facebook,
  Send,
  Rocket,
  Lock,
  Crown,
} from "lucide-react";

/**
 * Live 18+ full-page experience.
 *
 * Flow:
 *   1. Age verification gate
 *   2. VIP community landing (perks, how-to-join, admin contact, coming soon)
 *
 * Placeholders for admin contact links live in ADMIN_CONTACTS — swap the
 * `href` values later without touching the layout.
 */

const ADMIN_CONTACTS = {
  facebook: "https://facebook.com/",
  messenger: "https://m.me/",
  zalo: "https://zalo.me/",
};

type Stage = "age-gate" | "under-age" | "vip";

export function Live18Page() {
  const [stage, setStage] = useState<Stage>("age-gate");

  return (
    <div className="relative min-h-full w-full overflow-x-hidden bg-gradient-to-b from-rose-50 via-white to-pink-50">
      {/* Soft decorative glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(244,114,182,0.28), transparent 70%)",
        }}
      />

      <AnimatePresence mode="wait">
        {stage === "age-gate" ? (
          <AgeGate
            key="gate"
            onConfirm={() => setStage("vip")}
            onDeny={() => setStage("under-age")}
          />
        ) : stage === "under-age" ? (
          <UnderAge key="under" onBack={() => setStage("age-gate")} />
        ) : (
          <VipLanding key="vip" />
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Age verification                                                  */
/* -------------------------------------------------------------------------- */

function AgeGate({ onConfirm, onDeny }: { onConfirm: () => void; onDeny: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[440px] flex-col items-center justify-center px-5 py-10"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, type: "spring", stiffness: 260, damping: 22 }}
        className="mb-6 grid h-24 w-24 place-items-center rounded-[30px] bg-gradient-to-br from-pink-100 to-rose-50 text-5xl shadow-inner"
      >
        🔞
      </motion.div>

      <h1 className="text-center text-[26px] font-extrabold tracking-tight text-rose-950">
        Age Verification
      </h1>
      <p className="mt-3 max-w-[340px] text-center text-[15px] leading-relaxed text-rose-900/70">
        This section contains content intended only for adults.
      </p>

      <div className="mt-8 w-full rounded-3xl border border-rose-100 bg-white/90 p-6 text-center shadow-xl shadow-rose-100/60 backdrop-blur">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-rose-50 text-rose-500">
          <ShieldCheck size={20} />
        </div>
        <p className="text-[15.5px] font-semibold text-rose-950">
          Are you at least 18 years old?
        </p>

        <div className="mt-6 grid gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onConfirm}
            className="h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-[15px] font-bold text-white shadow-lg shadow-rose-200 transition hover:from-pink-600 hover:to-rose-600"
          >
            ✅ I am 18+
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onDeny}
            className="h-12 rounded-2xl border border-rose-200 bg-white text-[15px] font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            ❌ I am under 18
          </motion.button>
        </div>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-[12px] text-rose-900/50">
        <Lock size={12} /> Your answer stays on this device.
      </p>
    </motion.section>
  );
}

/* -------------------------------------------------------------------------- */
/* Under 18                                                                    */
/* -------------------------------------------------------------------------- */

function UnderAge({ onBack }: { onBack: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="relative mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[440px] flex-col items-center justify-center px-5 py-10"
    >
      <div className="mb-6 grid h-24 w-24 place-items-center rounded-[30px] bg-gradient-to-br from-rose-100 to-pink-50 text-5xl shadow-inner">
        🙏
      </div>
      <h2 className="text-center text-[22px] font-extrabold text-rose-950">
        Access restricted
      </h2>
      <p className="mt-3 max-w-[320px] text-center text-[15px] leading-relaxed text-rose-900/70">
        Sorry, this section is only available for users who are 18 years or
        older.
      </p>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onBack}
        className="mt-8 h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-8 text-[15px] font-bold text-white shadow-lg shadow-rose-200 hover:from-pink-600 hover:to-rose-600"
      >
        Go back
      </motion.button>
    </motion.section>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2-5 — VIP Landing                                                      */
/* -------------------------------------------------------------------------- */

function VipLanding() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative mx-auto w-full max-w-[480px] px-4 pb-16 pt-6"
    >
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 p-6 text-white shadow-2xl shadow-rose-200">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-pink-200/40 blur-2xl"
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur">
            <Video size={22} />
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/80">
              Exclusive
            </div>
            <h1 className="text-[24px] font-extrabold leading-tight">🎥 Live 18+</h1>
          </div>
        </div>
        <p className="relative mt-4 text-[15px] font-medium leading-relaxed text-white/90">
          Join the <span className="font-bold">VIP Zalo Community</span> — a
          private space for verified adult members.
        </p>
      </div>

      {/* About card */}
      <SectionCard
        icon={<Sparkles size={18} />}
        title="Members-only experience"
        subtitle="The Live 18+ feature is only available for members of our VIP Zalo Community."
        delay={0.05}
      >
        <ul className="mt-4 grid gap-2.5">
          <PerkRow icon={<Video size={16} />} text="Watch exclusive livestreams" />
          <PerkRow icon={<PartyPopper size={16} />} text="Join private events" />
          <PerkRow icon={<Users size={16} />} text="Meet verified members" />
          <PerkRow icon={<Bell size={16} />} text="Receive updates earlier" />
          <PerkRow icon={<Star size={16} />} text="Participate in community activities" />
        </ul>
      </SectionCard>

      {/* How to join */}
      <SectionCard
        icon={<UserPlus size={18} />}
        title="How to Join"
        subtitle="Four simple steps"
        delay={0.1}
      >
        <ol className="mt-4 grid gap-3">
          {[
            "Contact the administrator.",
            "Receive the invitation.",
            "Join the VIP Zalo Community.",
            "Enjoy all exclusive features.",
          ].map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 shadow-sm"
            >
              <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-[13px] font-bold text-white shadow">
                {i + 1}
              </span>
              <span className="pt-0.5 text-[14.5px] font-medium text-rose-950/85">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>

      {/* Admin contact */}
      <SectionCard
        icon={<Crown size={18} />}
        title="Administrator"
        subtitle="Reach out to request an invitation"
        delay={0.15}
      >
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-rose-50 p-4">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-rose-950">VIP Admin</div>
            <div className="truncate text-[12.5px] text-rose-900/60">
              Verified · Usually replies within an hour
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2.5">
          <ContactButton
            href={ADMIN_CONTACTS.facebook}
            icon={<Facebook size={16} />}
            label="Open Facebook"
            tone="blue"
          />
          <ContactButton
            href={ADMIN_CONTACTS.messenger}
            icon={<MessageCircle size={16} />}
            label="Open Messenger"
            tone="violet"
          />
          <ContactButton
            href={ADMIN_CONTACTS.zalo}
            icon={<Send size={16} />}
            label="Open Zalo"
            tone="pink"
          />
        </div>
      </SectionCard>

      {/* Coming soon */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="mt-5 flex items-center gap-3 rounded-3xl border border-dashed border-rose-200 bg-white/70 px-5 py-4 text-left shadow-sm backdrop-blur"
      >
        <div className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-gradient-to-br from-pink-100 to-rose-50 text-rose-500">
          <Rocket size={20} />
        </div>
        <div>
          <p className="text-[14.5px] font-bold text-rose-950">
            🚀 More exclusive Live features are coming soon.
          </p>
          <p className="mt-0.5 text-[13px] text-rose-900/60">Stay tuned.</p>
        </div>
      </motion.div>
    </motion.section>
  );
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* -------------------------------------------------------------------------- */

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
      className="mt-5 rounded-3xl border border-rose-100 bg-white/95 p-5 shadow-xl shadow-rose-100/50 backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-pink-100 to-rose-50 text-rose-600">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-[16.5px] font-extrabold leading-tight text-rose-950">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[12.5px] leading-snug text-rose-900/60">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function PerkRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-pink-50/50 px-4 py-3">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-white text-rose-500 shadow-sm">
        {icon}
      </span>
      <span className="text-[14px] font-medium text-rose-950/85">{text}</span>
    </li>
  );
}

function ContactButton({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone: "blue" | "violet" | "pink";
}) {
  const toneClass = {
    blue: "from-sky-500 to-blue-600 shadow-sky-200",
    violet: "from-violet-500 to-purple-600 shadow-violet-200",
    pink: "from-pink-500 to-rose-500 shadow-rose-200",
  }[tone];

  return (
    <motion.a
      whileTap={{ scale: 0.97 }}
      href={href}
      rel="noopener noreferrer"
      className={`flex h-12 items-center justify-between gap-2 rounded-2xl bg-gradient-to-r ${toneClass} px-5 text-[14.5px] font-bold text-white shadow-lg transition hover:brightness-110`}
    >
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      <ArrowRight size={16} className="opacity-80" />
    </motion.a>
  );
}
