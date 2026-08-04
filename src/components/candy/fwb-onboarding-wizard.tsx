import { useEffect, useMemo, useState } from "react";
import { Phone, Loader2, Sparkles, MapPinned, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

const STORAGE_KEY_PREFIX = "fwb_onb_done:";
const PHONE_REGEX = /^0[0-9]{9}$/;

/** Danh sách tag sở thích — user phải chọn ĐÚNG 3. */
export const INTEREST_TAGS: string[] = [
  "Cà phê", "Du lịch", "Xem phim", "Đọc sách", "Âm nhạc",
  "Nấu ăn", "Gym & Yoga", "Chạy bộ", "Bóng đá", "Game",
  "Nhiếp ảnh", "Vẽ", "Thú cưng", "Mua sắm", "Cú đêm",
  "Karaoke", "Pub & Bar", "Phượt", "Thiền", "Ẩm thực",
];

/**
 * Trả về true nếu user đã hoàn tất đăng ký "Tìm quanh đây".
 * Nguồn sự thật chính: dữ liệu profile (phone + age + interests/bio).
 * localStorage chỉ là cache phụ — tránh hiện wizard khi đổi máy / xoá storage.
 * LƯU Ý: Nick clone (is_seed_account === true) ĐƯỢC PHÉP truy cập thẳng,
 * không cần onboarding — kiểm tra ở phía caller (fwb-tinder-page).
 */
export function isFwbOnboarded(
  uidOrProfile:
    | string
    | {
        id?: string;
        email?: string | null;
        phone?: string | null;
        age?: number | null;
        bio?: string | null;
        interests?: string[] | null;
        is_fwb_active?: boolean | null;
        is_seed_account?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  if (!uidOrProfile) return false;
  if (typeof uidOrProfile === "object") {
    const p = uidOrProfile as any;
    // Nick clone luôn được coi là "đã onboarded".
    if (p.is_seed_account === true) return true;
    if (p.is_fwb_active === true) return true;
    const hasPhone = typeof p.phone === "string" && PHONE_REGEX.test(p.phone.trim());
    const hasAge = typeof p.age === "number" && p.age >= 18;
    const hasInterests =
      (Array.isArray(p.interests) && p.interests.length >= 3) ||
      (typeof p.bio === "string" && p.bio.trim().length >= 10);
    if (hasPhone && hasAge && hasInterests) return true;
    if (typeof window !== "undefined" && p.id) {
      return window.localStorage.getItem(STORAGE_KEY_PREFIX + p.id) === "1";
    }
    return false;
  }
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY_PREFIX + uidOrProfile) === "1";
}

function markOnboarded(uid: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PREFIX + uid, "1");
}

interface Props {
  onDone: () => void;
}

const AGE_OPTIONS = Array.from({ length: 63 }, (_, i) => 18 + i); // 18 → 80

export function FwbOnboardingWizard({ onDone }: Props) {
  const { me, refreshMe } = useAuth() as any;
  useBodyScrollLock(true);

  // Số điện thoại chỉ nhập một lần duy nhất trong toàn hệ thống — nếu profile
  // đã có phone hợp lệ (được lưu từ bước Đăng ký chính), dùng lại luôn và ẩn
  // trường nhập ở wizard phụ này để không hỏi lại lần hai.
  const [phone, setPhone] = useState<string>(me?.phone || "");
  const phoneAlreadySet = PHONE_REGEX.test((me?.phone || "").trim());

  const [age, setAge] = useState<string>(me?.age ? String(me.age) : "");
  const [interests, setInterests] = useState<string[]>(
    Array.isArray(me?.interests) ? me.interests.slice(0, 3) : [],
  );
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(""); }, [phone, age, interests]);

  if (!me) return null;

  const canSubmit = useMemo(() => {
    return PHONE_REGEX.test(phone.trim()) && !!age && interests.length === 3;
  }, [phone, age, interests]);

  const toggleInterest = (tag: string) => {
    setInterests((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 3) {
        toast.warning("Chỉ được chọn đúng 3 sở thích.");
        return prev;
      }
      return [...prev, tag];
    });
  };

  const submit = async () => {
    setErr("");

    // 1) Validate SĐT chặt chẽ — đúng định dạng 10 chữ số bắt đầu bằng 0
    const phoneVal = phone.trim();
    if (!PHONE_REGEX.test(phoneVal)) {
      setErr("Số điện thoại phải đúng 10 chữ số và bắt đầu bằng số 0.");
      return;
    }

    // 2) Validate tuổi
    const ageNum = parseInt(age, 10);
    if (!ageNum || ageNum < 18 || ageNum > 80) {
      setErr("Vui lòng chọn tuổi hợp lệ (18-80).");
      return;
    }

    // 3) Validate sở thích
    if (interests.length !== 3) {
      setErr("Bạn cần chọn đúng 3 sở thích.");
      return;
    }

    setBusy(true);
    try {
      // 4) Unique check SĐT trên Supabase
      const { data: dup, error: dupErr } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("phone", phoneVal)
        .neq("id", me.id)
        .maybeSingle();
      if (dupErr) {
        console.warn("[fwb-onb] unique check error:", dupErr);
      }
      if (dup) {
        toast.error("Số điện thoại này đã được đăng ký trên hệ thống!");
        setErr("Số điện thoại này đã được đăng ký trên hệ thống!");
        setBusy(false);
        return;
      }

      // 5) Lưu thẳng vào profiles: phone, age, interests, bio, is_fwb_active.
      // bio sinh ra từ interests để hiển thị nhanh ngay cả khi cột interests
      // chưa kịp migrate — không phụ thuộc vào schema mở rộng.
      const bioFromInterests = `Sở thích: ${interests.join(" • ")}`;

      const updatePayload: Record<string, unknown> = {
        phone: phoneVal,
        age: ageNum,
        bio: bioFromInterests,
        is_fwb_active: true,
      };

      let { error: updErr } = await (supabase as any)
        .from("profiles")
        .update({ ...updatePayload, interests })
        .eq("id", me.id);

      // Nếu cột `interests` chưa tồn tại trên schema, retry không có cột đó.
      if (updErr && /column .*interests/i.test(String(updErr.message || ""))) {
        const retry = await (supabase as any)
          .from("profiles")
          .update(updatePayload)
          .eq("id", me.id);
        updErr = retry.error ?? null;
      }

      if (updErr) {
        // Trùng phone ở mức DB (unique index)
        if (
          /duplicate key|unique constraint|profiles_phone_unique/i.test(
            String(updErr.message || ""),
          )
        ) {
          toast.error("Số điện thoại này đã được đăng ký trên hệ thống!");
          setErr("Số điện thoại này đã được đăng ký trên hệ thống!");
          setBusy(false);
          return;
        }
        console.error("[fwb-onb] profiles update failed:", updErr);
        setErr("Không lưu được hồ sơ, thử lại sau.");
        setBusy(false);
        return;
      }

      markOnboarded(me.id);
      try { refreshMe && refreshMe(); } catch { /* */ }

      toast.success("Hoàn tất! Mở khóa Tìm quanh đây 🎉");
      onDone();
    } catch (e: any) {
      console.error("[fwb-onb] submit failed", e);
      setErr("Không lưu được hồ sơ, thử lại sau.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fwb-onb-bd">
      <div className="fwb-onb-panel">
        <div className="flex items-center justify-center gap-2 mb-2 text-pink-500">
          <MapPinned size={22} />
          <h2 className="fwb-onb-title" style={{ margin: 0 }}>Tìm quanh đây</h2>
        </div>
        <p className="fwb-onb-sub">
          Hoàn thiện hồ sơ để mở khóa tính năng quét người phù hợp quanh bạn.
          Thông tin này sẽ hiển thị trong tab <b>Giới thiệu</b> của bạn.
        </p>

        {err ? <div className="fwb-onb-err">{err}</div> : null}

        {/* Số điện thoại — chỉ hiện nếu chưa lưu từ bước đăng ký chính */}
        {!phoneAlreadySet && (
          <div className="fwb-onb-field">
            <label><Phone size={14} className="inline mr-1" /> Số điện thoại (10 số)</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="0912345678"
            />
            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
              🔒 Mỗi số điện thoại chỉ dùng cho 1 tài khoản. Riêng tư với bạn.
            </p>
          </div>
        )}


        {/* Tuổi */}
        <div className="fwb-onb-field">
          <label>Tuổi</label>
          <select
            value={age}
            onChange={(e) => setAge(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "var(--background, #fff)",
              fontSize: 14,
            }}
          >
            <option value="">-- Chọn tuổi --</option>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>{a} tuổi</option>
            ))}
          </select>
        </div>

        {/* Sở thích — chọn đúng 3 */}
        <div className="fwb-onb-field">
          <label>
            <Sparkles size={14} className="inline mr-1" />
            Sở thích — chọn đúng <b>3</b> ({interests.length}/3)
          </label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8,
            }}
          >
            {INTEREST_TAGS.map((tag) => {
              const selected = interests.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  className="transition active:scale-95"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    border: selected
                      ? "1.5px solid #ec4899"
                      : "1px solid rgba(0,0,0,0.12)",
                    background: selected
                      ? "linear-gradient(135deg,#ec4899,#f43f5e)"
                      : "transparent",
                    color: selected ? "white" : "inherit",
                    cursor: "pointer",
                  }}
                >
                  {selected ? <Check size={12} /> : null}
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="fwb-onb-actions">
          <button
            className="fwb-onb-btn primary"
            disabled={busy || !canSubmit}
            onClick={submit}
          >
            {busy ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
            Hoàn tất & mở khóa
          </button>
        </div>
      </div>
    </div>
  );
}
