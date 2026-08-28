import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Flag, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { submitReport } from "@/services/reports-v2.service";
import { ReportAttackOverlay } from "@/components/candy/report-attack-overlay";
import { resolveUserName } from "@/lib/user-name";

export type ReportReason = "spam" | "scam" | "fake";

const REASON_LABEL: Record<ReportReason, string> = {
  spam: "Spam",
  scam: "Lừa đảo",
  fake: "Giả mạo",
};

const REASON_DESC: Record<ReportReason, string> = {
  spam: "Nội dung rác, quảng cáo, tin lặp lại",
  scam: "Có hành vi gian lận, lừa đảo tiền/tình",
  fake: "Mạo danh người khác / nhân vật công chúng",
};

interface ReportButtonProps {
  targetId: string;
  /** "profile" hoặc "message" */
  contextType?: "profile" | "message";
  contextId?: string | null;
  contextText?: string | null;
  /** kiểu hiển thị: nút icon tròn (mặc định) hay icon nhỏ inline */
  variant?: "icon" | "inline";
  className?: string;
  ariaLabel?: string;
}

interface ActorLite {
  name: string;
  avatar: string | null;
}

export function ReportButton({
  targetId,
  contextType = "profile",
  contextId = null,
  contextText = null,
  variant = "icon",
  className,
  ariaLabel = "Tố cáo",
}: ReportButtonProps) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "attack">("form");
  const [target, setTarget] = useState<ActorLite>({ name: "Đối tượng", avatar: null });
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setPhase("form");
      void (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("avatar, full_name, username")
          .eq("id", targetId)
          .maybeSingle();
        const p = data as {
          avatar: string | null;
          full_name: string | null;
          username: string | null;
        } | null;
        if (p) setTarget({ name: resolveUserName(p as any, "Đối tượng"), avatar: p.avatar });
      })();
    }
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, targetId]);

  if (!me || me.id === targetId) return null;

  const reporter: ActorLite = {
    name: resolveUserName(me as any, "Bạn"),
    avatar: me.avatar ?? null,
  };

  const submit = async (reason: ReportReason) => {
    if (submitting) return;
    setSubmitting(true);
    setPhase("attack");
    try {
      await submitReport({
        kind: contextType === "message" ? "messages" : "profiles",
        reporterId: me.id,
        reportedUserId: targetId,
        targetId: contextType === "message" ? (contextId ?? targetId) : targetId,
        reason,
        detail: contextText ?? null,
      });
      closeTimerRef.current = window.setTimeout(() => {
        toast.success(`Đã gửi tố cáo (${REASON_LABEL[reason]}). Cảm ơn bạn!`);
        setOpen(false);
      }, 1100);
    } catch (err: any) {
      console.error("[report-button] insert error:", err);
      toast.error("Không gửi được tố cáo: " + (err?.message ?? "lỗi không xác định"));
      setSubmitting(false);
      setPhase("form");
    }
  };

  return (
    <>
      <button
        type="button"
        className={variant === "inline" ? "ghost-link" : "icon-button"}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        title={ariaLabel}
        style={
          variant === "inline"
            ? { color: "hsl(var(--muted-foreground))", padding: 4 }
            : { background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }
        }
      >
        <Flag size={variant === "inline" ? 14 : 16} />
      </button>

      <DialogPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="report-dialog-overlay" />
          <DialogPrimitive.Content
            className="report-dialog-content"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className="report-dialog-header">
              <DialogPrimitive.Title className="report-dialog-title">
                <Flag size={17} />
                <span>Tố cáo</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="report-dialog-close" aria-label="Đóng popup tố cáo">
                <X size={18} />
              </DialogPrimitive.Close>
            </div>

            <div className="report-dialog-body">
              <AnimatePresence mode="wait">
                {phase === "form" ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="report-dialog-hint">
                      Chọn 1 lý do — đơn tố cáo sẽ được gửi ngay tới Admin.
                    </p>
                    <div className="report-reason-list">
                      {(Object.keys(REASON_LABEL) as ReportReason[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => void submit(r)}
                          disabled={submitting}
                          className="report-reason-item"
                        >
                          <span className="report-reason-icon">
                            <Flag size={15} />
                          </span>
                          <span className="report-reason-copy">
                            <span className="report-reason-label">{REASON_LABEL[r]}</span>
                            <span className="report-reason-desc">{REASON_DESC[r]}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="attack"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <ReportAttackOverlay reporter={reporter} target={target} compact />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {phase === "attack" ? (
              <div className="report-dialog-status">
                <motion.span
                  animate={{ opacity: [0.45, 1, 0.45] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  Đang truyền dữ liệu tới Admin…
                </motion.span>
              </div>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
