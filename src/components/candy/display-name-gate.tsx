import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { getFriendlyError } from "@/lib/friendly-error";
import { isReservedDisplayName, RESERVED_DISPLAY_NAME_MESSAGE } from "@/lib/reserved-display-names";
import { invalidateProfile } from "@/lib/profile-cache";

/**
 * Undismissable modal that forces the user to set `full_name` (display name)
 * before entering any part of the app. Rendered by <AppShell> as an OVERLAY
 * on top of the website — user can see the app behind (blurred), but cannot
 * click, scroll, ESC, or click outside to close. Only way out: submit a
 * valid display name.
 *
 * Validation:
 *  - min 2, max 8 characters
 *  - trim leading/trailing whitespace
 *  - allow Vietnamese diacritics + spaces
 *  - block HTML / script (< > characters)
 */
export function DisplayNameGate() {
  const { me, refreshMe } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Chặn Escape — không cho phép đóng bằng phím tắt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true } as any);
  }, []);

  // Khoá scroll body khi popup mở.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!me) return null;

  const validate = (raw: string): string | null => {
    const v = raw.trim();
    if (!v) return "Vui lòng nhập tên hiển thị.";
    if (v.length < 2) return "Tên Zalo tối thiểu 2 ký tự.";
    if (v.length > 25) return "Tên Zalo tối đa 25 ký tự.";
    if (/[<>]/.test(v)) return "Tên Zalo chứa ký tự không hợp lệ.";
    if (isReservedDisplayName(v)) return RESERVED_DISPLAY_NAME_MESSAGE;
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    const vErr = validate(clean);
    if (vErr) {
      setErr(vErr);
      toast.error(vErr);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: clean })
        .eq("id", me.id);
        invalidateProfile(me.id);
      if (error) {
        const msg = getFriendlyError(error, "Không lưu được tên hiển thị. Vui lòng thử lại.");
        setErr(msg);
        toast.error(msg);
        setSaving(false);
        return;
      }
      await refreshMe();
      toast.success("Đã lưu tên hiển thị.");
      // Component sẽ tự unmount khi me.full_name có giá trị.
    } catch (e: any) {
      const msg = getFriendlyError(e, "Không lưu được tên hiển thị. Vui lòng thử lại.");
      setErr(msg);
      toast.error(msg);
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dn-gate-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      // Chặn click ra ngoài — không cho đóng.
      onClick={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#ffffff",
          borderRadius: 24,
          padding: "28px 24px 24px",
          boxShadow: "0 30px 80px rgba(147, 51, 234, 0.35), 0 0 0 1px rgba(236, 72, 153, 0.15)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            margin: "0 auto",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            textAlign: "center",
            background: "linear-gradient(135deg, #a855f7, #ec4899)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Tên Zalo
        </div>


        <h2
          id="dn-gate-title"
          style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
        >
          Tên Zalo
        </h2>

        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (err) setErr(null);
          }}
          placeholder="Tên Zalo"
          maxLength={25}
          disabled={saving}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            borderRadius: 14,
            border: err ? "1.5px solid #ef4444" : "1.5px solid rgba(0,0,0,0.12)",
            outline: "none",
            background: "#fafafa",
          }}
        />
        <div style={{ fontSize: 12.5, color: err ? "#ef4444" : "rgba(0,0,0,0.5)", marginTop: -4 }}>
          {err ?? "Tên Zalo tối đa 25 ký tự."}
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 4,
            width: "100%",
            padding: "13px 18px",
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            border: "none",
            borderRadius: 14,
            cursor: saving ? "not-allowed" : "pointer",
            background: "linear-gradient(135deg, #a855f7, #ec4899)",
            boxShadow: "0 10px 24px rgba(168, 85, 247, 0.35)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? <Loader2 size={16} className="po-spin" /> : null}
          Xác nhận
        </button>
      </form>
    </div>
  );
}

export function needsDisplayName(me: any): boolean {
  if (!me) return false;
  const full = (me.full_name ?? "").toString().trim();
  const username = (me.username ?? "").toString().trim();
  if (full.length === 0) return true;
  // Legacy bug guard: một số tài khoản cũ bị auto-set full_name = username.
  // Coi trường hợp này là chưa có tên hiển thị để popup buộc user nhập lại.
  if (username && full.toLowerCase() === username.toLowerCase()) return true;
  return false;
}
