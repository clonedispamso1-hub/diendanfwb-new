// Redesigned "Liên hệ" tab.
// - No banner. Cards only: Facebook / Zalo / Phone.
// - Owner: view real values, add/edit/remove FB link + Zalo phone (10 digits) + own phone.
// - Guests: any "Xem" opens VIP unlock popup.
// - All modals render via React Portal (document.body) so they always sit above cards.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Eye,
  Lock,
  Pencil,
  Trash2,
  X,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Phone as PhoneIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ZaloVipLockModal } from "@/components/candy/zalo-vip-lock-modal";
import { canOpenContact } from "@/lib/contact-permission";
import { useAuth } from "@/components/candy/auth-provider";
import type { Profile } from "@/lib/app-types";

type FieldKey = "facebook" | "zalo" | "phone";

const FB_GRADIENT = "from-[#1877F2] to-[#0a52c4]";
const ZL_GRADIENT = "from-[#0068FF] to-[#00A6FF]";
const PH_GRADIENT = "from-fuchsia-500 to-pink-500";

function isValidFbLink(v: string) {
  return /^https?:\/\/(www\.|m\.)?(facebook\.com|fb\.com|fb\.me)\/[^\s]+/i.test(v.trim());
}
function isValidZaloPhone(v: string) {
  return /^0\d{9}$/.test(v.trim());
}
function zaloHref(phone: string) {
  return `https://zalo.me/${phone.trim()}`;
}

/* -------------------------- Portal helpers -------------------------- */

function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function ModalShell({
  onClose,
  children,
  labelledBy,
}: {
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-150"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm animate-in zoom-in-95 fade-in duration-200"
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

/* --------------------------- Main panel ---------------------------- */

export function ContactPanel({ profile, isOwn }: { profile: Profile; isOwn: boolean }) {
  const [fb, setFb] = useState<string>(((profile as any)?.facebook ?? "").toString());
  const [zl, setZl] = useState<string>(((profile as any)?.zalo ?? "").toString());
  const [phone, setPhone] = useState<string>(((profile as any)?.phone ?? "").toString().trim());

  useEffect(() => {
    setFb(((profile as any)?.facebook ?? "").toString());
    setZl(((profile as any)?.zalo ?? "").toString());
    setPhone(((profile as any)?.phone ?? "").toString().trim());
  }, [profile]);

  const { me } = useAuth();
  const [vipOpen, setVipOpen] = useState(false);
  const [editKey, setEditKey] = useState<null | FieldKey>(null);
  const [revealPhone, setRevealPhone] = useState(false);

  const cards = useMemo(
    () =>
      [
        {
          key: "facebook" as const,
          label: "Facebook",
          subtitle: "Kết nối Facebook cá nhân",
          value: fb.trim(),
          tint: FB_GRADIENT,
          glow: "shadow-[0_10px_40px_-10px_rgba(24,119,242,0.55)]",
          ring: "ring-[#1877F2]/30",
          icon: (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
            </svg>
          ),
        },
        {
          key: "zalo" as const,
          label: "Zalo",
          subtitle: "Kết nối qua số Zalo",
          value: zl.trim(),
          tint: ZL_GRADIENT,
          glow: "shadow-[0_10px_40px_-10px_rgba(0,104,255,0.55)]",
          ring: "ring-[#0068FF]/30",
          icon: (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M12 2C6.48 2 2 5.86 2 10.62c0 2.66 1.4 5.03 3.6 6.6-.13.6-.5 2.03-.57 2.34-.1.39.14.39.3.28.12-.08 1.94-1.32 2.72-1.85 1.24.35 2.56.55 3.95.55 5.52 0 10-3.86 10-8.62S17.52 2 12 2Z" />
            </svg>
          ),
        },
        {
          key: "phone" as const,
          label: "Số điện thoại",
          subtitle: "Thông tin riêng tư",
          value: phone,
          tint: PH_GRADIENT,
          glow: "shadow-[0_10px_40px_-10px_rgba(236,72,153,0.55)]",
          ring: "ring-fuchsia-500/30",
          icon: <PhoneIcon className="h-6 w-6" />,
        },
      ] as const,
    [fb, zl, phone],
  );

  const handleView = (key: FieldKey, hasValue: boolean) => {
    if (!isOwn && !canOpenContact(me as any, profile as any)) {
      setVipOpen(true);
      return;
    }
    if (!hasValue) {
      if (!isOwn) return;
      setEditKey(key);
      return;
    }
    if (key === "facebook") {
      window.open(fb.trim(), "_blank", "noopener,noreferrer");
    } else if (key === "zalo") {
      window.open(zaloHref(zl.trim()), "_blank", "noopener,noreferrer");
    } else {
      setRevealPhone((v) => !v);
    }
  };

  const handleRemove = async (key: FieldKey) => {
    if (!isOwn) return;
    const prev = key === "facebook" ? fb : key === "zalo" ? zl : phone;
    if (key === "facebook") setFb("");
    else if (key === "zalo") setZl("");
    else setPhone("");
    const { error } = await supabase
      .from("profiles")
      .update({ [key]: null } as any)
      .eq("id", profile.id);
    if (error) {
      if (key === "facebook") setFb(prev);
      else if (key === "zalo") setZl(prev);
      else setPhone(prev);
      toast.error("Không thể xóa. Vui lòng thử lại.");
    } else {
      toast.success("Đã xóa");
    }
  };

  return (
    <div className="tg-contact px-1 py-1">
      <div className="grid gap-3">
        {cards.map((c) => {
          const hasValue = !!c.value;
          const showEmptyForOwn = isOwn && !hasValue;
          return (
            <div
              key={c.key}
              className={`group relative overflow-hidden rounded-[20px] border border-border/60 bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 ${c.glow} hover:shadow-2xl`}
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.tint} opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.14]`}
              />
              <div
                aria-hidden
                className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${c.tint} opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-50`}
              />

              <div className="relative flex items-center gap-3">
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${c.tint} text-white shadow-lg ring-4 ${c.ring}`}
                >
                  {c.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="text-[15px] font-bold">{c.label}</div>
                    {c.key === "phone" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">
                        <Lock className="h-2.5 w-2.5" /> Riêng tư
                      </span>
                    ) : hasValue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                        <Check className="h-2.5 w-2.5" /> Đã liên kết
                      </span>
                    ) : null}
                  </div>

                  {/* Subtitle / value area */}
                  {isOwn ? (
                    hasValue ? (
                      c.key === "phone" ? (
                        revealPhone ? (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="truncate font-mono text-[13px] font-semibold text-primary">
                              {phone}
                            </span>
                            <CopyBtn text={phone} />
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                            Chỉ mình bạn xem được
                          </div>
                        )
                      ) : (
                        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                          {c.key === "zalo" ? c.value : c.value}
                        </div>
                      )
                    ) : (
                      <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {showEmptyForOwn ? "Chưa thêm" : c.subtitle}
                      </div>
                    )
                  ) : (
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                      🔒 Chỉ mở sau khi tham gia nhóm VIP
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {isOwn && !hasValue ? (
                    <button
                      onClick={() => setEditKey(c.key)}
                      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-br ${c.tint} px-3 py-1.5 text-[12px] font-semibold text-white shadow-md transition active:scale-95`}
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm ngay
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleView(c.key, hasValue)}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[12px] font-semibold backdrop-blur transition hover:bg-accent active:scale-95"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xem
                      </button>
                      {isOwn && hasValue && c.key !== "phone" ? (
                        <>
                          <button
                            onClick={() => setEditKey(c.key)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:text-foreground active:scale-95"
                            aria-label="Sửa"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemove(c.key)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:text-destructive active:scale-95"
                            aria-label="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {/* Owner-only expanded preview for fb/zalo when they have value */}
              {isOwn && hasValue && c.key !== "phone" ? (
                <div className="relative mt-3 flex items-center gap-2 rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <a
                    href={c.key === "facebook" ? fb.trim() : zaloHref(zl.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[12px] font-medium text-primary hover:underline"
                  >
                    {c.value}
                  </a>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* VIP unlock modal for non-owners — rendered via Portal by ZaloVipLockModal */}
      <ZaloVipLockModal
        open={vipOpen}
        title="Mở khóa tính năng"
        message="Bạn chưa tham gia nhóm VIP Zalo. Tham gia VIP để mở khóa Facebook, Zalo và số điện thoại của thành viên."
        onClose={() => setVipOpen(false)}
      />

      {/* Edit dialog(s) via Portal */}
      {editKey === "facebook" ? (
        <EditFacebookDialog
          initial={fb}
          onClose={() => setEditKey(null)}
          profileId={profile.id}
          onSaved={(v) => {
            setFb(v);
            setEditKey(null);
          }}
        />
      ) : null}
      {editKey === "zalo" ? (
        <EditZaloDialog
          initial={zl}
          onClose={() => setEditKey(null)}
          profileId={profile.id}
          onSaved={(v) => {
            setZl(v);
            setEditKey(null);
          }}
        />
      ) : null}
      {editKey === "phone" ? (
        <EditPhoneDialog
          initial={phone}
          onClose={() => setEditKey(null)}
          profileId={profile.id}
          onSaved={(v) => {
            setPhone(v);
            setEditKey(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* --------------------------- Sub components ------------------------ */

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        } catch {}
      }}
      className="grid h-6 w-6 place-items-center rounded-md border border-border/60 bg-background/70 text-muted-foreground transition hover:text-foreground"
      aria-label="Copy"
    >
      {ok ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function DialogCard({
  gradient,
  icon,
  title,
  desc,
  onClose,
  children,
}: {
  gradient: string;
  icon: ReactNode;
  title: string;
  desc: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl">
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${gradient} opacity-25`}
      />
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/80 backdrop-blur hover:bg-background"
        aria-label="Đóng"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="relative p-6">
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg`}
        >
          {icon}
        </div>
        <h2 className="mt-3 text-center text-lg font-bold">{title}</h2>
        <p className="mt-1 text-center text-[12.5px] text-muted-foreground">{desc}</p>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function EditFacebookDialog({
  initial,
  onClose,
  onSaved,
  profileId,
}: {
  initial: string;
  onClose: () => void;
  onSaved: (v: string) => void;
  profileId: string;
}) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = val.trim();
    if (!trimmed) return toast.error("Vui lòng dán link Facebook.");
    if (!isValidFbLink(trimmed))
      return toast.error("Link Facebook không hợp lệ. Ví dụ: https://facebook.com/abc");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ facebook: trimmed } as any)
      .eq("id", profileId);
    setSaving(false);
    if (error) {
      const msg = /column .* does not exist/i.test(error.message)
        ? "Thiếu cột 'facebook' trong bảng profiles. Chạy migration docs/sql/2026-07-26_profile_contact_links.sql."
        : error.message || "Lưu thất bại. Vui lòng thử lại.";
      return toast.error(msg);
    }
    toast.success("Đã lưu Facebook");
    onSaved(trimmed);
  };

  return (
    <ModalShell onClose={onClose}>
      <DialogCard
        gradient={FB_GRADIENT}
        onClose={onClose}
        title="Kết nối Facebook"
        desc=""
        icon={
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
            <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
          </svg>
        }
      >
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Link Facebook
        </label>
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Nhập link Facebook"
          className="mt-1.5 w-full rounded-2xl border bg-background px-4 py-2.5 text-[14px] outline-none ring-primary/30 focus:ring-2"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border bg-background px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-accent active:scale-[0.98]"
          >
            Hủy
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`flex-1 rounded-2xl bg-gradient-to-br ${FB_GRADIENT} px-4 py-2.5 text-[13.5px] font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60`}
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </DialogCard>
    </ModalShell>
  );
}

function EditZaloDialog({
  initial,
  onClose,
  onSaved,
  profileId,
}: {
  initial: string;
  onClose: () => void;
  onSaved: (v: string) => void;
  profileId: string;
}) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const digits = val.replace(/\D/g, "");
    if (!isValidZaloPhone(digits))
      return toast.error("Số Zalo phải gồm 10 chữ số và bắt đầu bằng số 0.");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ zalo: digits } as any)
      .eq("id", profileId);
    setSaving(false);
    if (error) {
      const msg = /column .* does not exist/i.test(error.message)
        ? "Thiếu cột 'zalo' trong bảng profiles. Chạy migration docs/sql/2026-07-26_profile_contact_links.sql."
        : error.message || "Lưu thất bại. Vui lòng thử lại.";
      return toast.error(msg);
    }
    toast.success("Đã lưu Zalo");
    onSaved(digits);
  };

  return (
    <ModalShell onClose={onClose}>
      <DialogCard
        gradient={ZL_GRADIENT}
        onClose={onClose}
        title="Kết nối Zalo"
        desc=""
        icon={
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
            <path d="M12 2C6.48 2 2 5.86 2 10.62c0 2.66 1.4 5.03 3.6 6.6-.13.6-.5 2.03-.57 2.34-.1.39.14.39.3.28.12-.08 1.94-1.32 2.72-1.85 1.24.35 2.56.55 3.95.55 5.52 0 10-3.86 10-8.62S17.52 2 12 2Z" />
          </svg>
        }
      >
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Số điện thoại Zalo
        </label>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={10}
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="Nhập số điện thoại"
          className="mt-1.5 w-full rounded-2xl border bg-background px-4 py-2.5 font-mono text-[15px] tracking-wider outline-none ring-primary/30 focus:ring-2"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border bg-background px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-accent active:scale-[0.98]"
          >
            Hủy
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`flex-1 rounded-2xl bg-gradient-to-br ${ZL_GRADIENT} px-4 py-2.5 text-[13.5px] font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60`}
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </DialogCard>
    </ModalShell>
  );
}

function EditPhoneDialog({
  initial,
  onClose,
  onSaved,
  profileId,
}: {
  initial: string;
  onClose: () => void;
  onSaved: (v: string) => void;
  profileId: string;
}) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const digits = val.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(digits))
      return toast.error("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: digits } as any)
      .eq("id", profileId);
    setSaving(false);
    if (error) return toast.error(error.message || "Lưu thất bại. Vui lòng thử lại.");
    toast.success("Đã lưu số điện thoại");
    onSaved(digits);
  };

  return (
    <ModalShell onClose={onClose}>
      <DialogCard
        gradient={PH_GRADIENT}
        onClose={onClose}
        title="Số điện thoại"
        desc="Số điện thoại của bạn được giữ riêng tư — chỉ mình bạn xem được."
        icon={<PhoneIcon className="h-7 w-7" />}
      >
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Số điện thoại
        </label>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={10}
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="0901234567"
          className="mt-1.5 w-full rounded-2xl border bg-background px-4 py-2.5 font-mono text-[15px] tracking-wider outline-none ring-primary/30 focus:ring-2"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border bg-background px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-accent active:scale-[0.98]"
          >
            Hủy
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`flex-1 rounded-2xl bg-gradient-to-br ${PH_GRADIENT} px-4 py-2.5 text-[13.5px] font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60`}
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </DialogCard>
    </ModalShell>
  );
}
