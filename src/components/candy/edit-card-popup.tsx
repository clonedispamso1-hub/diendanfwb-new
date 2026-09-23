/**
 * EditCardPopup — popup "Chỉnh sửa card" trong chat.
 * Cho phép cập nhật nhanh: Tuổi, Thân hình (theo giới tính hồ sơ),
 * Mục đích tìm kiếm. Lưu vào hồ sơ hiện có (không đổi cấu trúc DB).
 */
import { useEffect, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/app-types";

interface EditCardPopupProps {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSaved?: () => void;
  showToast?: (message: string) => void;
}

const BODY_TYPES_MALE = ["Mảnh", "Cân đối", "Cơ bắp", "Đầy đặn", "Cao lớn"];
const BODY_TYPES_FEMALE = ["Mảnh mai", "Cân đối", "Quyến rũ", "Đầy đặn", "Cao lớn"];

const INTENTS = [
  { value: "fwb", label: "Tìm FWB" },
  { value: "ons", label: "Tìm ONS" },
  { value: "love", label: "Tìm người yêu" },
] as const;

const BODY_TYPE_KEY = (userId: string) => `card-body-type:${userId}`;

export function EditCardPopup({ open, onClose, profile, onSaved, showToast }: EditCardPopupProps) {
  const isFemale = profile?.gender === "female";
  const bodyOptions = useMemo(() => (isFemale ? BODY_TYPES_FEMALE : BODY_TYPES_MALE), [isFemale]);

  const [age, setAge] = useState<string>("");
  const [bodyType, setBodyType] = useState<string>("");
  const [intent, setIntent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !profile) return;
    setAge(profile.age != null ? String(profile.age) : "");
    setIntent(profile.intent === "fwb" || profile.intent === "ons" || profile.intent === "love" ? profile.intent : "");
    try {
      setBodyType(window.localStorage.getItem(BODY_TYPE_KEY(profile.id)) ?? "");
    } catch {
      setBodyType("");
    }
  }, [open, profile]);

  // Nếu giới tính đổi → bỏ chọn thân hình không còn hợp lệ
  useEffect(() => {
    if (bodyType && !bodyOptions.includes(bodyType)) setBodyType("");
  }, [bodyOptions, bodyType]);

  if (!open) return null;

  const handleSave = async () => {
    if (!profile?.id || saving) return;
    const ageNum = age.trim() ? Number(age.trim()) : null;
    if (ageNum != null && (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 99)) {
      showToast?.("Tuổi phải từ 18 đến 99");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        age: ageNum,
        intent: intent || null,
      };
      let { error } = await supabase.from("profiles").update(payload as any).eq("id", profile.id);
      if (error) throw error;
      try {
        if (bodyType) window.localStorage.setItem(BODY_TYPE_KEY(profile.id), bodyType);
        else window.localStorage.removeItem(BODY_TYPE_KEY(profile.id));
      } catch { /* noop */ }
      showToast?.("Đã cập nhật card của bạn");
      onSaved?.();
      onClose();
    } catch {
      showToast?.("Không lưu được, thử lại sau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit-card-overlay" onClick={onClose} role="presentation">
      <div
        className="edit-card-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Chỉnh sửa card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edit-card-grabber" aria-hidden />
        <div className="edit-card-head">
          <h3>Chỉnh sửa card</h3>
          <button type="button" className="edit-card-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="edit-card-body">
          <label className="edit-card-field">
            <span className="edit-card-label">Tuổi</span>
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              placeholder="Nhập số tuổi"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </label>

          <div className="edit-card-field">
            <span className="edit-card-label">Thân hình</span>
            <div className="edit-card-chips">
              {bodyOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`edit-card-chip${bodyType === opt ? " is-active" : ""}`}
                  onClick={() => setBodyType(bodyType === opt ? "" : opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="edit-card-field">
            <span className="edit-card-label">Mục đích tìm kiếm</span>
            <div className="edit-card-chips">
              {INTENTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`edit-card-chip edit-card-chip--intent${intent === opt.value ? " is-active" : ""}`}
                  onClick={() => setIntent(intent === opt.value ? "" : opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button type="button" className="edit-card-save" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 size={18} className="edit-card-spin" /> : null}
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
    </div>
  );
}
