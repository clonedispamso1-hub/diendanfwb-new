import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StickyBackHeader } from "@/components/candy/sticky-back-header";
import { supabase } from "@/lib/supabase";
import { securityGate } from "@/lib/access-guard";
import type { Profile } from "@/lib/app-types";
import { logActivity } from "@/lib/activity-log";
import { logMemberActivity } from "@/lib/device-signal";

import { getFriendlyError } from "@/lib/friendly-error";
import { isReservedDisplayName, RESERVED_DISPLAY_NAME_MESSAGE } from "@/lib/reserved-display-names";
import { invalidateProfile, patchProfileCache, emitProfileUpdated } from "@/lib/profile-cache";
import { resolveUserName } from "@/lib/user-name";


const BIO_LIMIT = 200;
const NAME_MIN = 2;
const NAME_MAX = 25;
const NAME_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const NAME_LIMIT = 2;

interface EditProfileSheetProps {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSaved: () => void;
  /** "password" → cuộn tới phần Đổi mật khẩu khi popup mở. */
  focusSection?: "profile" | "password";
}

export function EditProfileSheet({ open, onClose, profile, onSaved, focusSection }: EditProfileSheetProps) {
  const [fullName, setFullName] = useState(resolveUserName(profile as any, ""));
  const [bio, setBio] = useState((profile.bio || "").slice(0, BIO_LIMIT));
  const [saving, setSaving] = useState(false);
  const passwordSectionRef = useRef<HTMLElement | null>(null);

  // Password change section state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(resolveUserName(profile as any, ""));
      setBio((profile.bio || "").slice(0, BIO_LIMIT));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open || focusSection !== "password") return;
    const t = window.setTimeout(() => {
      passwordSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 320);
    return () => window.clearTimeout(t);
  }, [open, focusSection]);

  /* ---------- Nút "Quay lại": dùng navigate(-1) mượt mà ----------
     Khi popup mở, đẩy 1 entry history riêng cho popup. Nhờ vậy:
     - Bấm "Quay lại" → navigate(-1) → popstate → đóng popup (không rời trang).
     - Nút Back của thiết bị cũng đóng popup thay vì rời khỏi trang cá nhân. */
  const pushedRef = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = saving || changingPassword;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    window.history.pushState({ ...(window.history.state || {}), epSheet: true }, "");
    pushedRef.current = true;

    const onPop = () => {
      pushedRef.current = false;
      if (busyRef.current) return;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Popup đã đóng bằng cách khác (Quay lại / Hủy / lưu xong) → dọn entry đã đẩy.
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
    // Chỉ phụ thuộc `open` để cleanup không chạy nhầm khi props đổi identity.
  }, [open]);

  const handleBack = useCallback(() => {
    if (busyRef.current) return;
    // Đóng ngay lập tức; entry history được dọn trong cleanup của effect ở trên.
    onCloseRef.current();
  }, []);


  const phone = (profile as any).phone || "";


  const handleSave = async () => {
    if (saving) return;

    const newName = fullName.trim();
    const currentName = (resolveUserName(profile as any, "")).trim();
    const nameChanged = newName.length > 0 && newName !== currentName;

    if (newName.length < NAME_MIN || newName.length > NAME_MAX) {
      toast.error(`Tên hiển thị phải từ ${NAME_MIN} đến ${NAME_MAX} ký tự.`);
      return;
    }
    if (/[<>]/.test(newName)) {
      toast.error("Tên hiển thị chứa ký tự không hợp lệ.");
      return;
    }
    if (isReservedDisplayName(newName)) {
      toast.error(RESERVED_DISPLAY_NAME_MESSAGE);
      return;
    }

    if (nameChanged) {
      const lastNameAt = profile.last_name_change ? new Date(profile.last_name_change).getTime() : 0;
      const withinNameWindow = lastNameAt && (Date.now() - lastNameAt) < NAME_WINDOW_MS;
      const usedInWindow = withinNameWindow ? (profile.name_changes || 0) : 0;
      if (usedInWindow >= NAME_LIMIT) {
        const next = new Date(lastNameAt + NAME_WINDOW_MS);
        toast.error(`Đã đổi tên đủ ${NAME_LIMIT} lần / 60 ngày. Thử lại sau ${next.toLocaleDateString("vi-VN")}.`);
        return;
      }
    }

    setSaving(true);
    try {
      if (nameChanged) {
        const { data: existed } = await supabase
          .from("profiles").select("id").eq("full_name", newName).neq("id", profile.id).maybeSingle();
        if (existed) {
          toast.error("Tên hiển thị đã được sử dụng.");
          setSaving(false);
          return;
        }
      }

      const payload: Record<string, any> = {
        bio: bio.trim(),
      };

      if (nameChanged) {
        const lastNameAt = profile.last_name_change ? new Date(profile.last_name_change).getTime() : 0;
        const withinNameWindow = lastNameAt && (Date.now() - lastNameAt) < NAME_WINDOW_MS;
        payload.full_name = newName;
        // display_name là nguồn ưu tiên khi hiển thị → phải cập nhật cùng lúc.
        payload.display_name = newName;
        payload.name_changes = withinNameWindow ? (profile.name_changes || 0) + 1 : 1;
        payload.last_name_change = new Date().toISOString();
      }

      const { error } = await supabase.from("profiles").update(payload as any).eq("id", profile.id);
      if (!error) {
        // Patch cache + phát event → Header / Feed / Profile cập nhật ngay, không cần F5.
        patchProfileCache(profile.id, payload);
        emitProfileUpdated(profile.id, payload);
      } else {
        invalidateProfile(profile.id);
      }
      if (error) {
        console.error("[EditProfileSheet] update error", error);
        toast.error(getFriendlyError(error, "Thao tác không thành công. Vui lòng thử lại."));
        setSaving(false);
        return;
      }

      if (nameChanged) {
        void logActivity({
          userId: profile.id,
          actionType: "name_change",
          description: `Bạn đã thay đổi tên hiển thị thành “${newName}”.`,
          metadata: { from: currentName, to: newName },
        });
      }
      if ((bio || "").trim() && (bio || "").trim() !== (profile.bio || "").trim()) {
        void logActivity({
          userId: profile.id,
          actionType: "status_update",
          description: `Bạn đã cập nhật trạng thái mới: “${bio.trim().slice(0, 80)}”.`,
          metadata: { preview: bio.trim().slice(0, 120) },
        });
      }
      toast.success("Đã cập nhật hồ sơ.");
      onSaved();
      onClose();
    } catch (err) {
      console.error("[EditProfileSheet] save error", err);
      toast.error(getFriendlyError(err, "Thao tác không thành công. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (changingPassword) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Vui lòng nhập đầy đủ thông tin.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới tối thiểu 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu nhập lại không khớp.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }

    setChangingPassword(true);
    try {
      const gate = await securityGate();
      if (gate.blocked) {
        await supabase.auth.signOut();
        toast.error(gate.message || "Thiết bị hoặc mạng của bạn đã bị khóa.");
        return;
      }
      // Verify current password by re-authenticating via the fake email format
      // used at signup: `${username.toLowerCase()}@fwb.local`.
      const uname = (profile.username || "").toLowerCase();
      const fakeEmail = `${uname}@fwb.local`;
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: currentPassword,
      });
      if (signInErr) {
        toast.error("Mật khẩu hiện tại không chính xác.");
        setChangingPassword(false);
        return;
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) {
        toast.error(getFriendlyError(updErr, "Đổi mật khẩu thất bại. Vui lòng thử lại."));
        setChangingPassword(false);
        return;
      }

      toast.success("Đổi mật khẩu thành công.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      void logActivity({
        userId: profile.id,
        actionType: "password_change",
        description: "Bạn đã đổi mật khẩu đăng nhập.",
      });
      // Ghi thêm vào member_activity_log (kèm IP / fingerprint / UA thật).
      void logMemberActivity("password_change", "Đổi mật khẩu đăng nhập");

    } catch (err) {
      console.error("[EditProfileSheet] change password error", err);
      toast.error(getFriendlyError(err, "Đổi mật khẩu thất bại. Vui lòng thử lại."));
    } finally {
      setChangingPassword(false);
    }
  };

  const nameCount = `${fullName.length}/${NAME_MAX}`;
  const isPasswordModal = focusSection === "password";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !saving && !changingPassword) onClose(); }}>
      <SheetContent
        side="bottom"
        className="ep-sheet rounded-t-[28px] p-0 max-h-[94vh] overflow-y-auto bg-background border-0 [&>button.absolute]:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=open]:duration-200"
      >
        <StickyBackHeader
          onBack={handleBack}
          title={isPasswordModal ? "Đổi mật khẩu" : "Chỉnh sửa trang cá nhân"}
        />

        {/* Header — tiêu đề + nút "Lưu thay đổi" nổi bật ở góc phải */}
        <div className="bg-background px-5 pt-4 pb-4 border-b border-border/50 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {isPasswordModal ? "Bảo mật" : "Tài khoản"}
            </p>
            <h3 className="mt-1 text-[20px] font-bold tracking-tight leading-tight truncate">
              {isPasswordModal ? "Đổi mật khẩu" : "Chỉnh sửa trang cá nhân"}
            </h3>
          </div>
          {isPasswordModal ? null : (
            <button
              type="button"
              data-testid="ep-save-header"
              disabled={saving}
              onClick={() => void handleSave()}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-[13px] font-bold shadow-md shadow-primary/25 transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
              {saving ? "Đang lưu" : "Lưu thay đổi"}
            </button>
          )}
        </div>


        <div className="px-4 sm:px-6 pt-6 pb-10 space-y-8">
          {isPasswordModal ? null : (
          <>

          {/* === Section: public identity === */}
          <section className="space-y-3">
            <div className="px-1">
              <h4 className="text-[13px] font-bold tracking-tight">Thông tin công khai</h4>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Những thông tin người khác nhìn thấy trên hồ sơ của bạn.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-4 sm:p-5 space-y-5">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label className="text-[12px] font-semibold text-foreground">Tên hiển thị</label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{nameCount}</span>
                </div>
                <input
                  className="w-full rounded-xl border border-border/70 bg-background/60 px-3.5 py-3 text-[15px] font-medium placeholder:text-muted-foreground/60 transition focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value.slice(0, NAME_MAX))}
                  maxLength={NAME_MAX}
                  placeholder="Tên hiển thị"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Tối đa {NAME_MAX} ký tự • Được đổi {NAME_LIMIT} lần / 60 ngày
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label className="text-[12px] font-semibold text-foreground">Tiểu sử</label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {BIO_LIMIT - bio.length}
                  </span>
                </div>
                <textarea
                  className="w-full resize-none rounded-xl border border-border/70 bg-background/60 px-3.5 py-3 text-[15px] leading-relaxed placeholder:text-muted-foreground/60 transition focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))}
                  maxLength={BIO_LIMIT}
                  placeholder="Viết vài dòng giới thiệu về bản thân..."
                />
              </div>
            </div>
          </section>

          {/* === Section: account info (read-only) === */}
          <section className="space-y-3">
            <div className="px-1">
              <h4 className="text-[13px] font-bold tracking-tight">Thông tin tài khoản</h4>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Không thể chỉnh sửa trực tiếp.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 shadow-sm divide-y divide-border/60 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <span className="text-[13px] text-muted-foreground">Tên đăng nhập</span>
                <span className="text-[14px] font-semibold text-foreground truncate">
                  {profile.username || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <span className="text-[13px] text-muted-foreground">Số điện thoại</span>
                <span className="text-[14px] font-semibold text-foreground truncate">
                  {phone || "Chưa khai báo"}
                </span>
              </div>
            </div>
          </section>
          </>
          )}

          {/* === Section: password === */}

          <section className="space-y-3" ref={passwordSectionRef}>
            <div className="px-1">
              <h4 className="text-[13px] font-bold tracking-tight">Bảo mật</h4>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Đổi mật khẩu đăng nhập của tài khoản.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-4 sm:p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] font-semibold text-foreground">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-border/70 bg-background/60 px-3.5 py-3 text-[15px] placeholder:text-muted-foreground/60 transition focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Mật khẩu hiện tại"
                  autoComplete="current-password"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-foreground">Mật khẩu mới</label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border/70 bg-background/60 px-3.5 py-3 text-[15px] placeholder:text-muted-foreground/60 transition focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-foreground">Nhập lại mật khẩu</label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border/70 bg-background/60 px-3.5 py-3 text-[15px] placeholder:text-muted-foreground/60 transition focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={changingPassword}
                onClick={() => void handleChangePassword()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary text-secondary-foreground px-5 py-3 text-[13px] font-semibold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              >
                {changingPassword ? <Loader2 size={14} className="animate-spin" /> : null}
                {changingPassword ? "Đang đổi mật khẩu" : "Đổi mật khẩu"}
              </button>
            </div>
          </section>

        </div>

        {/* Footer sticky — luôn hiển thị trên mọi thiết bị */}
        <div className="sticky bottom-0 z-20 flex items-center gap-3 border-t border-border/60 bg-background px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={saving || changingPassword}
            className="flex-1 rounded-xl border border-border bg-secondary text-secondary-foreground px-5 py-3 text-[14px] font-semibold transition active:scale-[0.99] disabled:opacity-60"
          >
            Hủy
          </button>
          {isPasswordModal ? null : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-[14px] font-semibold shadow-sm transition active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
              {saving ? "Đang lưu" : "Lưu thay đổi"}
            </button>
          )}

        </div>
      </SheetContent>
    </Sheet>
  );
}

