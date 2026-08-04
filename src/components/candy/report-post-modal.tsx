import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Flag } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { ReportAttackOverlay } from "@/components/candy/report-attack-overlay";
import { submitReport } from "@/services/reports-v2.service";

interface Props {
  open: boolean;
  postId: string;
  postOwnerId: string;
  onClose: () => void;
}

interface ActorLite {
  name: string;
  avatar: string | null;
}

const REASONS: string[] = [
  "Spam",
  "Liên quan tới người dưới 18 tuổi",
  "Nội dung mang tính bạo lực",
  "Nội dung người lớn",
  "Thông tin sai sự thật",
  "Tôi không muốn xem nội dung này",
  "Lừa đảo",
];

export function ReportPostModal({ open, postId, postOwnerId, onClose }: Props) {
  const { me } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "attack">("form");
  const [target, setTarget] = useState<ActorLite>({ name: "Đối tượng", avatar: null });
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setPhase("form");
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("avatar, full_name, username")
          .eq("id", postOwnerId)
          .maybeSingle();
        const p = data as {
          avatar: string | null;
          full_name: string | null;
          username: string | null;
        } | null;
        if (p) {
          setTarget({
            name: p.full_name || p.username || "Đối tượng",
            avatar: p.avatar,
          });
        }
      })();
    }
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, postOwnerId]);

  const reporter: ActorLite = {
    name: me?.full_name || me?.username || "Bạn",
    avatar: me?.avatar ?? null,
  };

  const submit = async (category: string) => {
    if (submitting) return;
    if (!me?.id) {
      toast.error("Bạn cần đăng nhập để gửi tố cáo.");
      return;
    }
    setSubmitting(true);
    setPhase("attack");
    try {
      await submitReport({
        kind: "posts",
        reporterId: me.id,
        reportedUserId: postOwnerId,
        targetId: postId,
        reason: category,
      });
      closeTimerRef.current = window.setTimeout(() => {
        toast.success("Hệ thống đã ghi nhận! Đơn lôi đài tố cáo của bạn đã được gửi tới Admin.", {
          duration: 3800,
        });
        onClose();
      }, 1100);
    } catch (err: any) {
      console.error("[report-post-modal] insert error:", err);
      toast.error("Không gửi được tố cáo: " + (err?.message ?? "lỗi không xác định"));
      setPhase("form");
      setSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
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
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={submitting}
                        onClick={() => void submit(r)}
                        className="report-reason-item"
                      >
                        <span className="report-reason-copy">
                          <span className="report-reason-label">{r}</span>
                        </span>
                        <Flag size={14} />
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
  );
}
