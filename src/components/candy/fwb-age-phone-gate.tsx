import { useMemo, useState } from "react";
import { Loader2, MapPinned, Phone, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { AgeSheet, ageLabel } from "@/components/candy/age-bottom-sheet";

const PHONE_REGEX = /^0[0-9]{9}$/;
const AGE_OPTIONS = Array.from({ length: 63 }, (_, i) => 18 + i);

/**
 * Trả về true nếu hồ sơ đã đủ điều kiện vào "Tìm quanh đây":
 * có phone hợp lệ + age >= 18. Nick clone (is_seed_account) luôn pass.
 */
export function isAgePhoneVerified(p: any | null | undefined): boolean {
  if (!p) return false;
  if (p.is_seed_account === true) return true;
  const hasPhone = typeof p.phone === "string" && PHONE_REGEX.test(p.phone.trim());
  const ageNum = typeof p.age === "number" ? p.age : parseInt(String(p.age ?? ""), 10);
  const hasAge = Number.isFinite(ageNum) && ageNum >= 18;
  return hasPhone && hasAge;
}

interface Props {
  onDone: () => void;
}

/**
 * Gate đơn giản cho "Tìm quanh đây" — chỉ hỏi SĐT + Tuổi.
 * SĐT chỉ admin xem được (RLS trên profiles giữ nguyên).
 * Nếu tuổi < 18 → khoá tài khoản (is_banned = true, ban_reason = 'underage').
 */
export function FwbAgePhoneGate({ onDone }: Props) {
  const { me, refreshMe } = useAuth() as any;
  useBodyScrollLock(true);

  const [phone, setPhone] = useState<string>(me?.phone || "");
  const [age, setAge] = useState<string>(me?.age ? String(me.age) : "");
  const [ageSheetOpen, setAgeSheetOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [underageLocked, setUnderageLocked] = useState(false);

  if (!me) return null;

  const canSubmit = useMemo(
    () => PHONE_REGEX.test(phone.trim()) && !!age,
    [phone, age],
  );

  const lockUnderage = async () => {
    try {
      await (supabase as any)
        .from("profiles")
        .update({
          is_banned: true,
          ban_reason: "underage",
          status: "banned",
        })
        .eq("id", me.id);
    } catch (e) {
      console.warn("[fwb-gate] lock underage failed", e);
    }
    setUnderageLocked(true);
  };

  const submit = async () => {
    setErr("");
    const phoneVal = phone.trim();
    if (!PHONE_REGEX.test(phoneVal)) {
      setErr("Số điện thoại phải đúng 10 chữ số và bắt đầu bằng số 0.");
      return;
    }
    const ageNum = parseInt(age, 10);
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 100) {
      setErr("Vui lòng chọn tuổi hợp lệ.");
      return;
    }

    setBusy(true);
    try {
      // Dưới 18 tuổi → khoá tài khoản, không lưu vào hồ sơ Tìm quanh đây.
      if (ageNum < 18) {
        await lockUnderage();
        setBusy(false);
        return;
      }

      // Check trùng SĐT trên hệ thống
      const { data: dup } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("phone", phoneVal)
        .neq("id", me.id)
        .maybeSingle();
      if (dup) {
        setErr("Số điện thoại này đã được đăng ký trên hệ thống!");
        setBusy(false);
        return;
      }

      const { error: updErr } = await (supabase as any)
        .from("profiles")
        .update({
          phone: phoneVal,
          age: ageNum,
          is_fwb_active: true,
        })
        .eq("id", me.id);

      if (updErr) {
        if (/duplicate key|unique constraint|profiles_phone_unique/i.test(String(updErr.message || ""))) {
          setErr("Số điện thoại này đã được đăng ký trên hệ thống!");
        } else {
          console.error("[fwb-gate] update profile failed", updErr);
          setErr("Không lưu được hồ sơ, thử lại sau.");
        }
        setBusy(false);
        return;
      }

      try { refreshMe && refreshMe(); } catch { /* */ }
      toast.success("Đã mở khóa Tìm quanh đây 🎉");
      onDone();
    } catch (e) {
      console.error("[fwb-gate] submit failed", e);
      setErr("Có lỗi, thử lại sau.");
      setBusy(false);
    }
  };

  // Màn hình khoá khi dưới 18 tuổi
  if (underageLocked) {
    return (
      <div className="fwb-onb-bd">
        <div className="fwb-onb-panel" style={{ textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(244,63,94,0.12)",
              color: "#f43f5e",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <Lock size={28} />
          </div>
          <h2 className="fwb-onb-title" style={{ margin: 0 }}>
            Website chỉ dành cho thành viên từ 18 tuổi trở lên.
          </h2>
          <p className="fwb-onb-sub" style={{ marginTop: 12 }}>
            Tài khoản đã bị khóa do không đủ điều kiện tuổi.
            <br />
            Vui lòng liên hệ quản trị viên để được hỗ trợ.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fwb-onb-bd">
      <div className="fwb-onb-panel">
        <div className="flex items-center justify-center gap-2 mb-2 text-pink-500">
          <MapPinned size={22} />
          <h2 className="fwb-onb-title" style={{ margin: 0 }}>
            📍 Mở khóa Tìm quanh đây
          </h2>
        </div>
        <p className="fwb-onb-sub">
          <ShieldCheck size={13} className="inline mr-1" />
          Thông tin này chỉ hiển thị với quản trị viên và được bảo mật.
        </p>

        {err ? <div className="fwb-onb-err">{err}</div> : null}

        <div className="fwb-onb-field">
          <label>
            <Phone size={14} className="inline mr-1" /> Số điện thoại (10 số)
          </label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="0912345678"
          />
        </div>

        <div className="fwb-onb-field">
          <label>Tuổi</label>
          <button
            type="button"
            className="age-trigger"
            data-empty={age === "" ? "1" : "0"}
            onClick={() => setAgeSheetOpen(true)}
          >
            <span>{age === "" ? "-- Chọn tuổi --" : ageLabel(Number(age))}</span>
            <span aria-hidden>▾</span>
          </button>
          <AgeSheet
            open={ageSheetOpen}
            value={age === "" ? "" : Number(age)}
            options={[...[13, 14, 15, 16, 17], ...AGE_OPTIONS]}
            onClose={() => setAgeSheetOpen(false)}
            onSelect={(v) => setAge(String(v))}
          />
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