import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { securityGate } from "@/lib/access-guard";
import type { Profile } from "@/lib/app-types";
import { logActivity } from "@/lib/activity-log";
import { logMemberActivity } from "@/lib/device-signal";

import { getFriendlyError } from "@/lib/friendly-error";

interface ChangePasswordSheetProps {
  open: boolean;
  onClose: () => void;
  profile: Profile;
}

export function ChangePasswordSheet({ open, onClose, profile }: ChangePasswordSheetProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [visible, setVisible] = useState<Record<"current" | "new" | "confirm", boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setVisible({ current: false, new: false, confirm: false });
      setFieldError({});
    }
  }, [open]);

  const busyRef = useRef(false);
  busyRef.current = changingPassword;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleBack = () => {
    if (busyRef.current) return;
    onCloseRef.current();
  };

  const handleChangePassword = async () => {
    if (changingPassword) return;
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.current = "Vui lòng nhập mật khẩu hiện tại.";
    if (!newPassword) errors.new = "Vui lòng nhập mật khẩu mới.";
    else if (newPassword.length < 6) errors.new = "Mật khẩu mới cần ít nhất 6 ký tự.";
    if (!confirmPassword) errors.confirm = "Vui lòng nhập lại mật khẩu mới.";
    else if (newPassword !== confirmPassword) errors.confirm = "Mật khẩu nhập lại không khớp.";
    if (newPassword && newPassword === currentPassword)
      errors.new = "Mật khẩu mới phải khác mật khẩu hiện tại.";
    setFieldError(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Vui lòng kiểm tra lại thông tin.");
      return;
    }
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
        setFieldError({ current: "Mật khẩu hiện tại không chính xác." });
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
      console.error("[ChangePasswordSheet] change password error", err);
      toast.error(getFriendlyError(err, "Đổi mật khẩu thất bại. Vui lòng thử lại."));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && !changingPassword) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="ep-sheet h-[min(92dvh,760px)] overflow-y-auto overscroll-contain rounded-t-[26px] border-0 bg-background p-0 shadow-2xl [&>button.absolute]:hidden sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2"
      >
        <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6">
          <div className="relative mx-auto flex w-full max-w-xl items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={changingPassword}
              className="settings-back-button"
            >
              <ChevronLeft size={16} strokeWidth={2.25} /> Quay lại
            </Button>
            <h2 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-bold text-foreground">
              Đổi mật khẩu
            </h2>
            <div className="h-9 w-[78px]" aria-hidden="true" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-xl px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-5 sm:px-6">
          <section>
            <div className="mb-6 flex items-start gap-3 px-1">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck size={21} />
              </span>
              <div>
                <h3 className="text-[18px] font-bold text-foreground">Bảo vệ tài khoản của bạn</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Chọn mật khẩu mới khác mật khẩu hiện tại để giữ tài khoản an toàn.
                </p>
              </div>
            </div>

            <div className="space-y-5 rounded-2xl bg-card p-4 shadow-[0_8px_28px_-20px_var(--color-foreground)] ring-1 ring-border/50 sm:p-5">
              {[
                {
                  key: "current" as const,
                  label: "Mật khẩu hiện tại",
                  value: currentPassword,
                  setValue: setCurrentPassword,
                  autoComplete: "current-password",
                },
                {
                  key: "new" as const,
                  label: "Mật khẩu mới",
                  value: newPassword,
                  setValue: setNewPassword,
                  autoComplete: "new-password",
                },
                {
                  key: "confirm" as const,
                  label: "Nhập lại mật khẩu mới",
                  value: confirmPassword,
                  setValue: setConfirmPassword,
                  autoComplete: "new-password",
                },
              ].map((field) => (
                <div className="space-y-2" key={field.key}>
                  <label
                    htmlFor={`password-${field.key}`}
                    className="text-[13px] font-semibold text-foreground"
                  >
                    {field.label}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      size={17}
                    />
                    <input
                      id={`password-${field.key}`}
                      type={visible[field.key] ? "text" : "password"}
                      value={field.value}
                      onChange={(event) => {
                        field.setValue(event.target.value);
                        setFieldError((prev) => ({ ...prev, [field.key]: "" }));
                      }}
                      onFocus={(event) =>
                        window.setTimeout(
                          () =>
                            event.currentTarget.scrollIntoView({
                              block: "center",
                              behavior: "smooth",
                            }),
                          180,
                        )
                      }
                      placeholder={field.key === "new" ? "Ít nhất 6 ký tự" : field.label}
                      autoComplete={field.autoComplete}
                      enterKeyHint={field.key === "confirm" ? "done" : "next"}
                      aria-invalid={Boolean(fieldError[field.key])}
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-12 text-[16px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setVisible((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                      }
                      className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground"
                      aria-label={visible[field.key] ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      {visible[field.key] ? <EyeOff size={17} /> : <Eye size={17} />}
                    </Button>
                  </div>
                  {fieldError[field.key] ? (
                    <p className="text-[12px] font-medium text-destructive">
                      {fieldError[field.key]}
                    </p>
                  ) : null}
                </div>
              ))}

              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <CheckCircle2
                  size={15}
                  className={newPassword.length >= 6 ? "text-primary" : "text-muted-foreground"}
                />
                Mật khẩu mới có ít nhất 6 ký tự
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                type="button"
                disabled={changingPassword}
                onClick={() => void handleChangePassword()}
                className="h-12 w-full rounded-xl text-[14px] font-bold shadow-sm shadow-primary/15 active:scale-[0.99]"
              >
                {changingPassword ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ShieldCheck size={17} />
                )}
                {changingPassword ? "Đang đổi mật khẩu" : "Đổi mật khẩu"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                disabled={changingPassword}
                className="h-11 w-full rounded-xl text-[14px] font-semibold text-muted-foreground"
              >
                Hủy
              </Button>
            </div>
          </section>
        </main>
      </SheetContent>
    </Sheet>
  );
}
