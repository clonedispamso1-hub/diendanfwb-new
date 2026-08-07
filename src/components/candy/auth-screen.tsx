import { BrandText } from "@/components/candy/brand-text";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, Check, Phone, Lock, ShieldCheck, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { HeartLoader } from "@/components/candy/app-loading";
import { TermsOfServiceModal } from "@/components/candy/terms-of-service-modal";
import { getFriendlyError } from "@/lib/friendly-error";
import { supabase } from "@/lib/supabase";

const SHOW_RELOGIN_KEY = "fwb_show_relogin_notice";
const POST_REGISTER_GRACE_KEY = "fwb_post_register_grace_until";

const FORGOT_PASSWORD_URL = "https://www.facebook.com/profile.php?id=61577419911101";

type Mode = "login" | "register";

/* --------------------------- Toast safety helper -------------------------- */
/**
 * Coerce anything into a human-readable string so we never render `{}` from
 * a stray object. Prefer .message on Error-like objects; fall back to a
 * generic Vietnamese message if the value has no useful text.
 */
function toMessage(v: unknown, fallback = "Đã xảy ra lỗi, vui lòng thử lại."): string {
  if (v == null) return fallback;
  if (typeof v === "string") {
    const text = v.trim();
    return text && text !== "{}" && text !== "[object Object]" ? text : fallback;
  }
  if (v instanceof Error) {
    const text = v.message?.trim();
    return text && text !== "{}" && text !== "[object Object]" ? text : fallback;
  }
  if (typeof v === "object") {
    const errorRecord = v as Record<string, unknown>;
    const msg = errorRecord.message ?? errorRecord.error ?? errorRecord.error_description;
    if (typeof msg === "string") {
      const text = msg.trim();
      if (text && text !== "{}" && text !== "[object Object]") {
        const details = [
          typeof errorRecord.code === "string" ? `SQLSTATE ${errorRecord.code}` : null,
          text,
          typeof errorRecord.details === "string" ? errorRecord.details : null,
          typeof errorRecord.hint === "string" ? `Hint: ${errorRecord.hint}` : null,
        ].filter(Boolean);
        return details.join(" — ");
      }
    }
    return fallback;
  }
  const text = String(v).trim();
  return text && text !== "{}" && text !== "[object Object]" ? text : fallback;
}
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
  }
}
const showError = (v: unknown, fallback?: string) => {
  console.log("[AuthScreen] showError raw", v);
  console.log("[AuthScreen] showError JSON", safeJson(v));
  const message = toMessage(v, fallback);
  if (!message) return;
  toast.error(message);
};
const showSuccess = (msg: string) => {
  if (!msg) return;
  toast.success(msg);
};

/* ------------------------------- Validation ------------------------------- */

// Tên đăng nhập cũ (giữ tương thích với tài khoản đã tạo trước đây).
const USERNAME_RE = /^[a-z0-9]{4,20}$/;
const EMAIL_LIKE_RE = /@|\.(com|net|org|vn|io|co|edu|gov|info|xyz|me|dev)\b/i;
// Số điện thoại VN: 10 số, bắt đầu bằng 0.
const PHONE_RE = /^0\d{9}$/;

const INVALID_PHONE_MSG =
  "Số điện thoại không hợp lệ. Vui lòng nhập đúng số điện thoại gồm 10 số và bắt đầu bằng số 0.";

function validatePhone(p: string): string | null {
  if (!p) return "Vui lòng nhập số Zalo.";
  if (!PHONE_RE.test(p)) return INVALID_PHONE_MSG;
  return null;
}

function validateLoginIdentifier(u: string): string | null {
  const v = u.trim();
  if (!v) return "Vui lòng nhập số Zalo.";
  if (EMAIL_LIKE_RE.test(v))
    return "Không được đăng nhập bằng email. Vui lòng dùng số điện thoại.";
  if (PHONE_RE.test(v) || USERNAME_RE.test(v)) return null;
  return INVALID_PHONE_MSG;
}


// Đơn giản hoá thang mật khẩu — chỉ 3 mức: Yếu / Trung bình / Mạnh.
function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  if (pw.length < 6) return { score: 1, label: "Yếu", color: "#ff5470" };
  if (!(hasLetter && hasDigit)) return { score: 2, label: "Trung bình", color: "#ffa53b" };
  return { score: 3, label: "Mạnh", color: "#3ddc97" };
}

// Password đăng ký: tối thiểu 6 ký tự, có ít nhất 1 chữ cái + 1 chữ số.
function validatePasswordForRegister(pw: string): string | null {
  if (!pw) return "Vui lòng nhập mật khẩu.";
  if (pw.length < 6) return "Mật khẩu phải có ít nhất 6 ký tự.";
  if (!/[A-Za-z]/.test(pw)) return "Mật khẩu phải có ít nhất 1 chữ cái.";
  if (!/\d/.test(pw)) return "Mật khẩu phải có ít nhất 1 chữ số.";
  if (/\s/.test(pw)) return "Mật khẩu không được chứa khoảng trắng.";
  if (pw.length > 128) return "Mật khẩu tối đa 128 ký tự.";
  return null;
}

/* ------------------------------- Main component ---------------------------- */


/* ------------------------------ Main component ---------------------------- */

export function AuthScreen() {
  const { login, register, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [redirecting, setRedirecting] = useState(false);
  const [postRegisterCountdown, setPostRegisterCountdown] = useState<number | null>(null);
  const [reloginNotice, setReloginNotice] = useState<string | null>(null);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [regStep, setRegStep] = useState(0); // 0: số Zalo, 1: mật khẩu, 2: điều khoản

  const usernameRef = useRef<HTMLInputElement>(null);

  const REGISTER_STEPS = [
    { key: "phone", label: "Số Zalo", icon: Phone },
    { key: "password", label: "Mật khẩu", icon: Lock },
    { key: "terms", label: "Xác nhận", icon: ShieldCheck },
  ] as const;

  function validateRegisterStep(step: number): boolean {
    if (step === 0) {
      const uErr = validatePhone(username.trim());
      if (uErr) {
        setErrors({ username: uErr });
        showError(uErr);
        return false;
      }
      if (phoneTaken) {
        const msg = "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.";
        setErrors({ username: msg });
        showError(msg);
        return false;
      }
      if (phoneChecking) {
        showError("Đang kiểm tra số điện thoại, vui lòng đợi một chút...");
        return false;
      }
      return true;
    }
    if (step === 1) {
      const pErr = validatePasswordForRegister(password);
      const cErr = password !== confirm ? "Mật khẩu xác nhận không khớp." : null;
      const next: Record<string, string> = {};
      if (pErr) next.password = pErr;
      if (cErr) next.confirm = cErr;
      if (Object.keys(next).length) {
        setErrors(next);
        showError(Object.values(next)[0]);
        return false;
      }
      return true;
    }
    return true;
  }

  function goToNextStep() {
    if (!validateRegisterStep(regStep)) return;
    setErrors({});
    setRegStep((s) => Math.min(s + 1, REGISTER_STEPS.length - 1));
  }

  function goToPrevStep() {
    setErrors({});
    setRegStep((s) => Math.max(s - 1, 0));
  }

  // Hiển thị thông báo "vui lòng đăng nhập lại" sau khi vừa auto-logout xong.
  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_RELOGIN_KEY) === "1") {
        localStorage.removeItem(SHOW_RELOGIN_KEY);
        const msg = "Để bảo mật tài khoản, vui lòng đăng nhập lại để tiếp tục sử dụng.";
        setReloginNotice(msg);
        toast.success(msg);
      }
    } catch { /* ignore */ }
  }, []);

  // Countdown 5s sau khi đăng ký thành công → logout → quay về login.
  useEffect(() => {
    if (postRegisterCountdown == null) return;
    if (postRegisterCountdown <= 0) {
      (async () => {
        try { localStorage.removeItem(POST_REGISTER_GRACE_KEY); } catch { /* ignore */ }
        try { localStorage.setItem(SHOW_RELOGIN_KEY, "1"); } catch { /* ignore */ }
        await logout();
        setPostRegisterCountdown(null);
        setMode("login");
        setPassword("");
        setConfirm("");
        setAgreed(false);
        setRegStep(0);
      })();
      return;
    }
    const t = window.setTimeout(() => setPostRegisterCountdown((n) => (n == null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [postRegisterCountdown, logout]);

  useEffect(() => {
    const t = window.setTimeout(() => usernameRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [mode]);

  // Realtime dup check số điện thoại ngay khi user gõ đủ 10 số (chỉ ở màn Register).
  useEffect(() => {
    if (mode !== "register") {
      setPhoneTaken(false);
      setPhoneChecking(false);
      return;
    }
    const v = username.trim();
    if (!PHONE_RE.test(v)) {
      setPhoneTaken(false);
      setPhoneChecking(false);
      return;
    }
    let cancelled = false;
    setPhoneChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const [{ data: byPhone }, { data: byUsername }] = await Promise.all([
          supabase.from("profiles").select("id").eq("phone", v).maybeSingle(),
          supabase.from("profiles").select("id").ilike("username", v).maybeSingle(),
        ]);
        if (cancelled) return;
        const taken = Boolean(byPhone || byUsername);
        setPhoneTaken(taken);
        setPhoneChecking(false);
        if (taken) {
          setErrors((e) => ({
            ...e,
            username: "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.",
          }));
        }
      } catch {
        if (!cancelled) {
          setPhoneChecking(false);
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, mode]);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _, ...rest } = e;
      return rest;
    });

  // Chỉ giữ chữ số, tối đa 10 ký tự (dùng cho ô nhập số Zalo ở màn Register).
  const sanitizePhoneInput = (v: string) => v.replace(/\D+/g, "").slice(0, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (mode === "login") {
      const uErr = validateLoginIdentifier(username);
      const pErr = password ? null : "Vui lòng nhập mật khẩu.";
      const next: Record<string, string> = {};
      if (uErr) next.username = uErr;
      if (pErr) next.password = pErr;
      if (Object.keys(next).length) {
        setErrors(next);
        return;
      }
      setSubmitting(true);
      const res = await login(username, password);
      if (!res.success) {
        setSubmitting(false);
        const msg = toMessage(res.error, "Số Zalo hoặc mật khẩu không chính xác.");
        setErrors({ password: msg });
        showError(msg);
        return;
      }
      setRedirecting(true);
      showSuccess("Đăng nhập thành công");
      return;
    }

    // Register (bằng số Zalo) — form nhiều bước: chỉ submit thật ở bước cuối.
    if (regStep < REGISTER_STEPS.length - 1) {
      goToNextStep();
      return;
    }
    const uErr = validatePhone(username.trim());
    const pErr = validatePasswordForRegister(password);
    const cErr = password !== confirm ? "Mật khẩu xác nhận không khớp." : null;
    const tErr = agreed ? null : "Vui lòng đồng ý với điều khoản sử dụng.";
    const next: Record<string, string> = {};
    if (uErr) next.username = uErr;
    else if (phoneTaken)
      next.username = "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.";
    if (pErr) next.password = pErr;
    if (cErr) next.confirm = cErr;
    if (tErr) next.terms = tErr;
    if (Object.keys(next).length) {
      setErrors(next);
      const firstMsg = Object.values(next)[0];
      if (firstMsg) showError(firstMsg);
      return;
    }

    setSubmitting(true);
    let res: { success: boolean; error?: unknown; requiresEmailConfirmation?: boolean } = { success: false };
    try {
      res = await register({ phone: username.trim(), password });
      console.log("[AuthScreen] register result", res);
      console.log("[AuthScreen] register result JSON", safeJson(res));
    } catch (err) {
      console.log("[AuthScreen] register thrown error", err);
      console.log("[AuthScreen] register thrown error JSON", safeJson(err));
      res = { success: false, error: err };
    }
    setSubmitting(false);
    if (!res.success) {
      const friendly = getFriendlyError(res.error, "Đăng ký thất bại. Vui lòng thử lại sau.");
      setErrors({ username: friendly });
      toast.error(friendly);
      return;
    }
    if (res.requiresEmailConfirmation) {
      showSuccess("Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.");
      setMode("login");
      setPassword("");
      setConfirm("");
      setAgreed(false);
      setRegStep(0);
      return;
    }
    setPostRegisterCountdown(5);
  }


  return (
    <div className="auth-root relative min-h-[100dvh] w-full overflow-hidden">
      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-5 sm:py-10">
        <motion.div
          className="auth-card auth-card--v2"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="auth-avatar-wrap">
            <div className="auth-avatar-ring">
              <div className="auth-avatar-core">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={mode === "login" ? "login-avatar" : `reg-avatar-${regStep}`}
                    initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.6, rotate: 8 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="inline-flex"
                  >
                    {mode === "login" ? (
                      <Sparkles className="h-8 w-8 text-white" strokeWidth={2.2} />
                    ) : (
                      (() => {
                        const StepIcon = REGISTER_STEPS[regStep].icon;
                        return <StepIcon className="h-8 w-8 text-white" strokeWidth={2.2} />;
                      })()
                    )}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="auth-logo auth-logo--compact">
            <div className="auth-brand-row">
              <BrandText size={44} className="auth-brand-name" />
            </div>
            <p className="auth-brand-tagline">Kết nối uy tín.</p>
          </div>

          {mode === "register" && (
            <div className="auth-progress" role="progressbar" aria-valuenow={regStep + 1} aria-valuemin={1} aria-valuemax={REGISTER_STEPS.length}>
              <div className="auth-progress-track">
                <motion.div
                  className="auth-progress-fill"
                  initial={false}
                  animate={{ width: `${(regStep / (REGISTER_STEPS.length - 1)) * 100}%` }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                />
              </div>
              <div className="auth-progress-steps">
                {REGISTER_STEPS.map((s, i) => {
                  const StepIcon = s.icon;
                  const state = i < regStep ? "done" : i === regStep ? "active" : "todo";
                  return (
                    <div key={s.key} className={`auth-progress-step auth-progress-step--${state}`}>
                      <span className="auth-progress-dot">
                        {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <StepIcon className="h-3.5 w-3.5" strokeWidth={2.4} />}
                      </span>
                      <span className="auth-progress-label">{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            {mode === "login" && (
              <motion.div
                key="login-form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <Field
                  label="Số Zalo"
                  placeholder="0xxxxxxxxx"
                  value={username}
                  onChange={(v) => {
                    setUsername(v);
                    clearError("username");
                  }}
                  autoComplete="username"
                  inputRef={usernameRef}
                  error={errors.username}
                  disabled={submitting || redirecting}
                />

                <div className="flex flex-col gap-2">
                  <Field
                    label="Mật khẩu"
                    placeholder="••••••••"
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      clearError("password");
                    }}
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    error={errors.password}
                    disabled={submitting || redirecting}
                    rightIcon={
                      <button
                        type="button"
                        className="auth-eye"
                        onClick={() => setShowPw((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    }
                  />
                  <div className="flex justify-end">
                    <a href={FORGOT_PASSWORD_URL} rel="noreferrer" className="auth-forgot">
                      Quên mật khẩu?
                    </a>
                  </div>
                </div>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={submitting || redirecting}
                >
                  {redirecting ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <HeartLoader size="sm" /> Đang chuyển hướng…
                    </span>
                  ) : submitting ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <HeartLoader size="sm" /> Đang đăng nhập…
                    </span>
                  ) : (
                    <span>Đăng nhập</span>
                  )}
                </button>
              </motion.div>
            )}

            {mode === "register" && (
              <AnimatePresence mode="wait" initial={false}>
                {regStep === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-5"
                  >
                    <Field
                      label="Số Zalo"
                      placeholder="0xxxxxxxxx"
                      value={username}
                      onChange={(v) => {
                        setUsername(sanitizePhoneInput(v));
                        clearError("username");
                      }}
                      autoComplete="tel"
                      inputMode="numeric"
                      inputRef={usernameRef}
                      error={errors.username}
                      disabled={submitting || redirecting}
                      rightIcon={
                        PHONE_RE.test(username.trim()) ? (
                          <span className="auth-eye" aria-hidden="true">
                            {phoneChecking ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : phoneTaken ? null : (
                              <Check className="h-4 w-4" style={{ color: "#3ddc97" }} strokeWidth={3} />
                            )}
                          </span>
                        ) : undefined
                      }
                    />
                    <button
                      type="button"
                      className="auth-submit auth-submit--next"
                      onClick={goToNextStep}
                      disabled={phoneChecking || phoneTaken}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        Tiếp tục <ArrowRight className="h-[18px] w-[18px]" />
                      </span>
                    </button>
                  </motion.div>
                )}

                {regStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-5"
                  >
                    <div className="flex flex-col gap-2">
                      <Field
                        label="Mật khẩu"
                        placeholder="Ít nhất 6 ký tự"
                        value={password}
                        onChange={(v) => {
                          setPassword(v);
                          clearError("password");
                        }}
                        type={showPw ? "text" : "password"}
                        autoComplete="new-password"
                        error={errors.password}
                        disabled={submitting || redirecting}
                        rightIcon={
                          <button
                            type="button"
                            className="auth-eye"
                            onClick={() => setShowPw((v) => !v)}
                            tabIndex={-1}
                            aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          >
                            {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                          </button>
                        }
                      />
                      {password && (
                        <div className="auth-strength">
                          <div className="auth-strength-bar">
                            <div
                              className="auth-strength-fill"
                              style={{
                                width: `${(strength.score / 3) * 100}%`,
                                background: strength.color,
                              }}
                            />
                          </div>
                          <span className="auth-strength-label" style={{ color: strength.color }}>
                            {strength.label}
                          </span>
                        </div>
                      )}
                    </div>

                    <Field
                      label="Nhập lại mật khẩu"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(v) => {
                        setConfirm(v);
                        clearError("confirm");
                      }}
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      error={errors.confirm}
                      disabled={submitting || redirecting}
                      rightIcon={
                        <button
                          type="button"
                          className="auth-eye"
                          onClick={() => setShowConfirm((v) => !v)}
                          tabIndex={-1}
                          aria-label={showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        >
                          {showConfirm ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                        </button>
                      }
                    />

                    <div className="auth-step-nav">
                      <button type="button" className="auth-btn-back" onClick={goToPrevStep}>
                        <ArrowLeft className="h-[18px] w-[18px]" /> Quay lại
                      </button>
                      <button type="button" className="auth-submit auth-submit--next" onClick={goToNextStep}>
                        <span className="inline-flex items-center justify-center gap-2">
                          Tiếp tục <ArrowRight className="h-[18px] w-[18px]" />
                        </span>
                      </button>
                    </div>
                  </motion.div>
                )}

                {regStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-5"
                  >
                    <div className="auth-review">
                      <div className="auth-review-row">
                        <span className="auth-review-label">Số Zalo</span>
                        <span className="auth-review-value">{username || "—"}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="auth-terms">
                        <span
                          className={`auth-checkbox ${agreed ? "auth-checkbox--on" : ""}`}
                          onClick={() => {
                            setAgreed((v) => !v);
                            clearError("terms");
                          }}
                          role="checkbox"
                          aria-checked={agreed}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              setAgreed((v) => !v);
                              clearError("terms");
                            }
                          }}
                        >
                          {agreed && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="auth-terms-text">
                          Tôi đồng ý với{" "}
                          <button type="button" className="auth-terms-link" onClick={() => setShowTerms(true)}>
                            điều khoản sử dụng
                          </button>
                        </span>
                      </label>
                      {toMessage(errors.terms, "") && (
                        <div className="auth-error">{toMessage(errors.terms, "")}</div>
                      )}
                    </div>

                    <div className="auth-step-nav">
                      <button type="button" className="auth-btn-back" onClick={goToPrevStep} disabled={submitting}>
                        <ArrowLeft className="h-[18px] w-[18px]" /> Quay lại
                      </button>
                      <button
                        type="submit"
                        className="auth-submit"
                        disabled={submitting || redirecting || phoneChecking || phoneTaken}
                      >
                        {submitting ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <HeartLoader size="sm" /> Đang tạo tài khoản…
                          </span>
                        ) : (
                          <span>Đăng ký</span>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            <div className="mt-1 text-center auth-switch-text">
              {mode === "login" ? (
                <>
                  Chưa có tài khoản?{" "}
                  <button
                    type="button"
                    className="auth-switch-link"
                    onClick={() => {
                      setMode("register");
                      setErrors({});
                      setRegStep(0);
                    }}
                  >
                    Đăng ký ngay
                  </button>
                </>
              ) : (
                <>
                  Đã có tài khoản?{" "}
                  <button
                    type="button"
                    className="auth-switch-link"
                    onClick={() => {
                      setMode("login");
                      setErrors({});
                      setRegStep(0);
                    }}
                  >
                    Đăng nhập
                  </button>
                </>
              )}
            </div>
          </form>
        </motion.div>
      </div>

      {showTerms && (
        <TermsOfServiceModal
          open={showTerms}
          onClose={() => setShowTerms(false)}
          onAccept={() => {
            setAgreed(true);
            clearError("terms");
          }}
        />
      )}

      <AnimatePresence>
        {postRegisterCountdown != null && (
          <motion.div
            role="dialog"
            aria-modal="true"
            className="auth-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="auth-modal-card"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="auth-modal-icon">
                <Check className="h-8 w-8 text-white" strokeWidth={3} />
              </div>
              <h3 className="auth-modal-title">Đăng ký thành công!</h3>
              <p className="auth-modal-text">
                Để hoàn tất kích hoạt tài khoản và sử dụng đầy đủ tất cả tính năng,
                vui lòng đăng nhập lại.
              </p>
              <p className="auth-modal-sub">Hệ thống sẽ tự động đăng xuất sau</p>
              <div className="auth-modal-countdown">{postRegisterCountdown}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {reloginNotice && (
        <div className="auth-toast-wrap">
          <div className="auth-toast">{reloginNotice}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Field --------------------------------- */

function Field({
  label,
  rightIcon,
  placeholder,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  error,
  disabled,
  inputRef,
}: {
  label: string;
  rightIcon?: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  error?: unknown;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const message = toMessage(error, "");
  return (
    <div className="flex flex-col gap-1.5">
      <label>
        <span className="auth-label">{label}</span>
        <div className={`auth-field ${message ? "auth-field--error" : ""}`}>
          <input
            ref={inputRef}
            type={type}
            className="auth-input"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            inputMode={inputMode}
            disabled={disabled}
            spellCheck={false}
          />
          {rightIcon}
        </div>
      </label>
      {message && <div className="auth-error">{message}</div>}
    </div>
  );
}
