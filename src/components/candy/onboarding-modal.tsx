import { useMemo, useState } from "react";
import { Loader2, ArrowRight, ArrowLeft, Lock, Sparkles, Check, MapPin, User, Briefcase, Heart } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { INTENT_OPTIONS, type Intent } from "@/lib/vn-provinces";
import { ProvinceCombobox } from "@/components/candy/province-combobox";
import { emitIntentChange } from "@/lib/intent-store";
import { pickDefaultAvatar, isPlaceholderAvatar } from "@/lib/default-avatars";
import type { Profile } from "@/lib/app-types";

/**
 * OnboardingModal — Multi-step popup (Dark glow theme)
 *
 * Step 1: Tên + Khu vực + Giới tính (gender khoá sau khi lưu)
 * Step 2: Chọn tối đa 3 sở thích
 * Step 3: Công việc hiện tại (khoá vĩnh viễn sau khi lưu)
 * Step 4: Nhu cầu cá nhân — chọn 1 trong 3 (khoá vĩnh viễn)
 *
 * Toàn bộ dữ liệu được ghi xuống `profiles` 1 lần duy nhất ở bước cuối.
 */

const HOBBIES: Array<{ value: string; emoji: string; label: string }> = [
  { value: "travel", emoji: "✈️", label: "Du lịch" },
  { value: "movie", emoji: "🎬", label: "Xem phim" },
  { value: "music", emoji: "🎧", label: "Nghe nhạc" },
  { value: "cooking", emoji: "🍳", label: "Nấu ăn" },
  { value: "gaming", emoji: "🎮", label: "Chơi game" },
  { value: "sport", emoji: "🏀", label: "Thể thao" },
  { value: "reading", emoji: "📚", label: "Đọc sách" },
  { value: "coffee", emoji: "☕", label: "Cà phê" },
  { value: "fashion", emoji: "👗", label: "Thời trang" },
  { value: "pets", emoji: "🐶", label: "Nuôi thú cưng" },
  { value: "photography", emoji: "📷", label: "Nhiếp ảnh" },
  { value: "art", emoji: "🎨", label: "Nghệ thuật" },
  { value: "dance", emoji: "💃", label: "Khiêu vũ" },
  { value: "yoga", emoji: "🧘", label: "Yoga/Gym" },
  { value: "shopping", emoji: "🛍️", label: "Shopping" },
  { value: "tech", emoji: "💻", label: "Công nghệ" },
];

const MAX_HOBBIES = 3;
const TOTAL_STEPS = 4;

type OnboardingProfileUpdate = Pick<Profile, "full_name" | "province" | "location" | "intent" | "interests"> & {
  gender?: "male" | "female";
  current_job?: string;
  avatar?: string;
};

export function OnboardingModal() {
  const { me, refreshMe } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1
  const [fullName, setFullName] = useState((me?.full_name || "").trim());
  const [province, setProvince] = useState<string>(me?.province || me?.location || "");
  const [gender, setGender] = useState<"male" | "female" | "">(((me as any)?.gender as any) || "");

  // Step 2
  const initialInterests: string[] = Array.isArray((me as any)?.interests)
    ? ((me as any).interests as string[]).slice(0, MAX_HOBBIES)
    : [];
  const [interests, setInterests] = useState<string[]>(initialInterests);

  // Step 3
  const [currentJob, setCurrentJob] = useState<string>(((me as any)?.current_job as string) || "");
  const jobLocked = !!((me as any)?.current_job);

  // Step 4
  const [intent, setIntent] = useState<Intent | "">((me?.intent as Intent) || "");

  const [saving, setSaving] = useState(false);

  if (!me) return null;

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      const name = fullName.trim();
      if (name.length < 2 || name.length > 40) return "Tên phải từ 2 đến 40 ký tự.";
      if (!province) return "Vui lòng chọn khu vực.";
      if (gender !== "male" && gender !== "female") return "Vui lòng chọn giới tính.";
    }
    if (s === 2) {
      if (interests.length === 0) return "Hãy chọn ít nhất 1 sở thích.";
      if (interests.length > MAX_HOBBIES) return `Tối đa ${MAX_HOBBIES} sở thích.`;
    }
    if (s === 3) {
      const job = currentJob.trim();
      if (job.length < 2 || job.length > 60) return "Công việc cần từ 2 đến 60 ký tự.";
    }
    if (s === 4) {
      if (!intent) return "Hãy chọn 1 nhu cầu cá nhân.";
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    if (step < TOTAL_STEPS) setStep(step + 1);
    else void handleSave();
  };

  const goBack = () => { if (step > 1) setStep(step - 1); };

  const toggleHobby = (value: string) => {
    setInterests((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (prev.length >= MAX_HOBBIES) {
        toast.error(`Chỉ được chọn tối đa ${MAX_HOBBIES} sở thích nha 🥰`);
        return prev;
      }
      return [...prev, value];
    });
  };

  const handleSave = async () => {
    // Final validation
    for (let s = 1; s <= TOTAL_STEPS; s++) {
      const err = validateStep(s);
      if (err) { setStep(s); toast.error(err); return; }
    }

    setSaving(true);
    try {
      const name = fullName.trim();
      const { data: existed } = await supabase
        .from("profiles").select("id").eq("full_name", name).neq("id", me.id).maybeSingle();
      if (existed) {
        toast.error("Tên hiển thị đã được sử dụng, vui lòng chọn tên khác.");
        setStep(1);
        setSaving(false);
        return;
      }

      const payload: OnboardingProfileUpdate = {
        full_name: name,
        province,
        location: province,
        intent,
        interests,
      };
      if (!(me as any).gender && (gender === "male" || gender === "female")) {
        payload.gender = gender;
      }
      if (!jobLocked) payload.current_job = currentJob.trim();
      if (isPlaceholderAvatar((me as any).avatar)) {
        payload.avatar = pickDefaultAvatar(gender as "male" | "female");
      }

      const sanitizedPayload: OnboardingProfileUpdate = {
        full_name: payload.full_name,
        province: payload.province,
        location: payload.location,
        intent: payload.intent,
        interests: Array.isArray(payload.interests) ? [...payload.interests] : [],
        ...(payload.gender ? { gender: payload.gender } : {}),
        ...(payload.current_job ? { current_job: payload.current_job } : {}),
        ...(payload.avatar ? { avatar: payload.avatar } : {}),
      };

      const { error } = await supabase.from("profiles").update(sanitizedPayload as any).eq("id", me.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      emitIntentChange(me.id, intent as Intent);
      toast.success("🎉 Hoàn tất hồ sơ! Chào mừng bạn đến với cộng đồng.");
      await refreshMe();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được hồ sơ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => { /* không cho đóng */ }}>
      <DialogContent
        className="onboarding-glow-shell sm:max-w-lg max-h-[94vh] overflow-y-auto p-0 border-0 bg-transparent shadow-none [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Hoàn tất hồ sơ của bạn</DialogTitle>
        <DialogDescription className="sr-only">
          Hoàn thành các bước để vào cộng đồng.
        </DialogDescription>

        <div className="onboarding-card relative rounded-3xl overflow-hidden">
          {/* Aurora glow background */}
          <div className="onboarding-aurora" aria-hidden />

          <div className="relative z-10 px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
            {/* Progress */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
                  Bước {step} / {TOTAL_STEPS}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {step === 1 && "Thông tin cơ bản"}
                  {step === 2 && "Sở thích"}
                  {step === 3 && "Công việc"}
                  {step === 4 && "Nhu cầu"}
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-400 shadow-[0_0_12px_rgba(236,72,153,0.6)]"
                  initial={false}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {step === 1 && (
                  <StepHeader
                    icon={<User size={18} />}
                    title="Chào mừng bạn 👋"
                    subtitle="Cộng đồng cần một chút thông tin để nhận diện bạn."
                  />
                )}
                {step === 2 && (
                  <StepHeader
                    icon={<Sparkles size={18} />}
                    title="Sở thích của bạn"
                    subtitle={`Chọn tối đa ${MAX_HOBBIES} điều bạn yêu thích.`}
                  />
                )}
                {step === 3 && (
                  <StepHeader
                    icon={<Briefcase size={18} />}
                    title="Công việc hiện tại"
                    subtitle="Khắc tên nghề của bạn lên hồ sơ — vĩnh viễn 💎"
                  />
                )}
                {step === 4 && (
                  <StepHeader
                    icon={<Heart size={18} />}
                    title="Mục đích kết nối"
                    subtitle="Lựa chọn này là duy nhất và không thể thay đổi."
                  />
                )}

                <div className="mt-5 space-y-5">
                  {step === 1 && (
                    <>
                      <Field label="Tên của bạn">
                        <input
                          className="onboarding-input"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          maxLength={40}
                          placeholder="Tên hiển thị trong cộng đồng"
                          autoFocus
                        />
                      </Field>

                      <Field label="Khu vực của bạn" icon={<MapPin size={13} />}>
                        <ProvinceCombobox
                          value={province}
                          onChange={setProvince}
                          placeholder="Tìm tỉnh / thành phố"
                          required
                        />
                      </Field>


                      <Field label="Giới tính" hint={<><Lock size={11} className="inline -mt-0.5 mr-1" />Không thể thay đổi sau khi lưu</>}>
                        <div className="grid grid-cols-2 gap-3">
                          <GenderTile
                            active={gender === "male"}
                            disabled={!!(me as any).gender}
                            onClick={() => setGender("male")}
                            icon="♂"
                            label="Nam"
                            accent="from-sky-500/30 to-indigo-500/10"
                          />
                          <GenderTile
                            active={gender === "female"}
                            disabled={!!(me as any).gender}
                            onClick={() => setGender("female")}
                            icon="♀"
                            label="Nữ"
                            accent="from-pink-500/30 to-fuchsia-500/10"
                          />
                        </div>
                      </Field>
                    </>
                  )}

                  {step === 2 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-zinc-400">Đã chọn</span>
                        <span className={`text-xs font-semibold ${interests.length >= MAX_HOBBIES ? "text-rose-300" : "text-zinc-200"}`}>
                          {interests.length} / {MAX_HOBBIES}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {HOBBIES.map((h) => {
                          const active = interests.includes(h.value);
                          const blocked = !active && interests.length >= MAX_HOBBIES;
                          return (
                            <button
                              key={h.value}
                              type="button"
                              disabled={blocked}
                              onClick={() => toggleHobby(h.value)}
                              className={`onboarding-chip ${active ? "onboarding-chip-active" : ""} ${blocked ? "onboarding-chip-blocked" : ""}`}
                            >
                              <span className="text-base">{h.emoji}</span>
                              <span>{h.label}</span>
                              {active && <Check size={13} className="ml-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <Field
                      label="Công việc hiện tại"
                      hint={<><Lock size={11} className="inline -mt-0.5 mr-1" />Khoá vĩnh viễn sau khi lưu</>}
                    >
                      <input
                        className="onboarding-input"
                        value={currentJob}
                        onChange={(e) => setCurrentJob(e.target.value)}
                        maxLength={60}
                        placeholder="Vd: Lập trình viên, Sinh viên, Designer…"
                        disabled={jobLocked}
                        autoFocus
                      />
                      <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
                        ⚠️ <span className="font-semibold">Nhập nghiêm túc nha quý dị ơi!</span> Công việc này sẽ gắn liền với bạn luôn và <span className="font-semibold">KHÔNG</span> thể chỉnh sửa sau khi bấm lưu đâu nè! 🥰
                      </div>
                    </Field>
                  )}

                  {step === 4 && (
                    <div className="space-y-3">
                      {INTENT_OPTIONS.map((opt) => {
                        const active = intent === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setIntent(opt.value)}
                            className={`onboarding-intent-card ${active ? "onboarding-intent-active" : ""}`}
                          >
                            <span className="text-2xl">{opt.emoji}</span>
                            <span className="flex-1 text-left">
                              <span className="block text-sm font-semibold text-white">{opt.label}</span>
                              <span className="block text-[12px] text-zinc-400 mt-0.5">{opt.description}</span>
                            </span>
                            <span className={`onboarding-radio ${active ? "onboarding-radio-on" : ""}`}>
                              {active && <Check size={14} />}
                            </span>
                          </button>
                        );
                      })}
                      <div className="rounded-xl border border-rose-400/15 bg-rose-500/5 px-3.5 py-2.5 text-[12px] text-rose-200/90">
                        <Lock size={11} className="inline -mt-0.5 mr-1" />
                        Lựa chọn này là <span className="font-semibold">DUY NHẤT</span> và không thể đổi sau khi bấm hoàn tất.
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Footer actions */}
            <div className="mt-7 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1 || saving}
                className="onboarding-btn-ghost"
              >
                <ArrowLeft size={15} /> Quay lại
              </button>

              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="onboarding-btn-primary"
              >
                {saving ? (
                  <><Loader2 size={15} className="animate-spin" /> Đang lưu…</>
                ) : step < TOTAL_STEPS ? (
                  <>Tiếp theo <ArrowRight size={15} /></>
                ) : (
                  <>Hoàn tất & vào cộng đồng <Sparkles size={15} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 mb-2">
        <span className="text-pink-300">{icon}</span>
        Hoàn tất hồ sơ
      </div>
      <h2 className="text-xl sm:text-[22px] font-semibold text-white tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] text-zinc-400">{subtitle}</p>
    </div>
  );
}

function Field({
  label, hint, icon, children,
}: { label: string; hint?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        {icon}{label}
      </label>
      {children}
      {hint && <div className="text-[11px] text-zinc-500 pt-0.5">{hint}</div>}
    </div>
  );
}

function GenderTile({
  active, disabled, onClick, icon, label, accent,
}: { active: boolean; disabled: boolean; onClick: () => void; icon: string; label: string; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-2xl border px-4 py-4 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "border-pink-400/60 bg-gradient-to-br " + accent + " text-white shadow-[0_0_22px_rgba(236,72,153,0.35)]"
          : "border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] hover:border-white/20"
      }`}
    >
      <span className="text-2xl block">{icon}</span>
      <span className="mt-1 block">{label}</span>
      {active && <span className="absolute top-2 right-2 text-pink-300"><Check size={14} /></span>}
    </button>
  );
}

/**
 * Trả về true nếu profile thiếu một trong các trường onboarding bắt buộc.
 */
export function needsOnboarding(profile: any | null | undefined): boolean {
  if (!profile) return false;
  const fullName = (profile.full_name || "").trim();
  const province = (profile.province || profile.location || "").trim();
  const gender = profile.gender;
  const intent = profile.intent;
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const job = (profile.current_job || "").trim();
  return !fullName || !province || !gender || !intent || interests.length === 0 || !job;
}
