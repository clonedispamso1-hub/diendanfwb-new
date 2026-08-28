import { useState } from "react";
import { Loader2, Phone, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { FWB_INTERESTS, MAX_INTERESTS } from "@/lib/fwb-interests";
import { resolveUserName } from "@/lib/user-name";

interface Props {
  initial?: {
    phone?: string | null;
    age?: number | null;
    interests?: string[] | null;
  } | null;
  onCancel: () => void;
  onDone: (data: { phone: string; age: number; interests: string[] }) => void;
}

/**
 * Onboarding bắt buộc trước khi vào chế độ FWB sub-profile.
 * Form: Số điện thoại + Tuổi + tối đa 3 sở thích.
 */
export function FwbModeOnboarding({ initial, onCancel, onDone }: Props) {
  const { me } = useAuth() as any;
  useBodyScrollLock(true);
  const [phone, setPhone] = useState(initial?.phone ?? me?.phone ?? "");
  const [age, setAge] = useState<string>(
    initial?.age ? String(initial.age) : me?.age ? String(me.age) : "",
  );
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!me) return null;

  const toggleInterest = (key: string) => {
    setErr("");
    setInterests((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_INTERESTS) {
        setErr(`Chỉ được chọn tối đa ${MAX_INTERESTS} sở thích.`);
        return prev;
      }
      return [...prev, key];
    });
  };

  const submit = async () => {
    setErr("");
    const phoneVal = phone.trim();
    if (!/^\+?\d{9,15}$/.test(phoneVal.replace(/\s/g, ""))) {
      setErr("Số điện thoại không hợp lệ.");
      return;
    }
    const ageNum = parseInt(age, 10);
    if (!ageNum || ageNum < 18 || ageNum > 80) {
      setErr("Tuổi phải từ 18 đến 80.");
      return;
    }
    if (interests.length === 0) {
      setErr("Hãy chọn ít nhất 1 sở thích.");
      return;
    }
    setBusy(true);
    try {
      // Lưu fwb_profiles (best-effort).
      try {
        await (supabase as any).from("fwb_profiles").upsert(
          {
            user_id: me.id,
            phone: phoneVal,
            display_name: resolveUserName(me as any, ""),
            age: ageNum,
            gender: me.gender ?? null,
            city: me.province ?? null,
            bio: "",
            interests,
            completed: true,
          },
          { onConflict: "user_id" },
        );
      } catch (e) {
        console.warn("[fwb-mode] fwb_profiles upsert failed", e);
      }
      // Sync sang profiles để các UI khác đọc được số điện thoại / tuổi / is_fwb_active.
      try {
        await (supabase as any)
          .from("profiles")
          .update({ phone: phoneVal, age: ageNum, is_fwb_active: true })
          .eq("id", me.id);
      } catch (e) {
        console.warn("[fwb-mode] profiles update failed", e);
      }
      toast.success("Đã kích hoạt tài khoản FWB!");
      onDone({ phone: phoneVal, age: ageNum, interests });
    } catch (e: any) {
      setErr("Không lưu được thông tin, thử lại sau.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-pink-500/30 bg-[#120816] p-5 shadow-[0_20px_80px_-20px_rgba(236,72,153,0.55)] animate-in zoom-in-95 duration-200">
        <button
          type="button"
          aria-label="Đóng"
          onClick={onCancel}
          className="absolute top-3 right-3 grid place-items-center h-9 w-9 rounded-full bg-white/5 text-white/70 hover:bg-white/10 transition"
        >
          <X size={16} />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
          <h2 className="text-lg font-bold text-white">
            Kích hoạt tài khoản FWB
          </h2>
        </div>
        <p className="text-xs text-white/60 mb-4">
          Hoàn thiện hồ sơ phụ để chuyển sang không gian Tìm FWB. Thông tin được bảo mật riêng tư.
        </p>

        {err ? (
          <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {err}
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5 mb-1.5">
              <Phone size={13} /> Số điện thoại
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912345678"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-pink-500/60 focus:bg-white/10 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/80 mb-1.5 block">
              Tuổi
            </label>
            <input
              type="number"
              min={18}
              max={80}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="VD: 25"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-pink-500/60 focus:bg-white/10 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/80 mb-1.5 flex items-center justify-between">
              <span>Sở thích</span>
              <span className="text-[10px] text-white/50">
                {interests.length}/{MAX_INTERESTS}
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
              {FWB_INTERESTS.map((i) => {
                const active = interests.includes(i.key);
                return (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => toggleInterest(i.key)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition active:scale-95 ${
                      active
                        ? "border-pink-400 bg-gradient-to-r from-pink-500/30 to-fuchsia-500/30 text-white shadow-[0_0_12px_rgba(236,72,153,0.6)]"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="mr-1">{i.emoji}</span>
                    {i.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_-6px_rgba(236,72,153,0.7)] hover:opacity-95 transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={14} className="inline mr-2 animate-spin" />
            ) : null}
            Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
}
