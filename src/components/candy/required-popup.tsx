/**
 * Popup bắt buộc — WIZARD 2 BƯỚC, thiết kế tối giản (2026-08-15).
 *
 * Bước 1: Tham gia Fanpage Chính Thức
 * Bước 2: Tham gia Nhóm Facebook
 *
 * Hoàn thành → đóng popup, lưu timestamp, ẩn trong `hide_hours` giờ.
 *
 * Hiệu năng: đọc cấu hình đúng 1 lần / phiên, không polling, không realtime,
 * không preload ảnh. Mở popup không gọi API.
 *
 * Điều kiện hiển thị: chỉ khi người dùng đã đăng nhập bình thường (không phải
 * ngay sau khi đăng ký, không phải lần đăng nhập đầu tiên sau đăng ký) và
 * KHÔNG ở trạng thái pending / blocked / locked / maintenance.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Facebook, Users, Check } from "lucide-react";
import {
  fetchRequiredPopup,
  loadVerifyProgress,
  saveVerifyProgress,
  type RequiredPopupConfig,
} from "@/lib/site/db2-settings";
import { isSecondaryConfigured } from "@/integrations/supabase/secondary-client";
import { useAuth } from "@/components/candy/auth-provider";
import {
  isFollowPopupSuppressed,
  markFollowPopupSeen,
} from "@/lib/site/follow-popup-gate";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
const HIDE_KEY = "site.required_popup.hidden_until";

/** Các đường dẫn chặn popup: đăng nhập/đăng ký, chờ duyệt, bị chặn, bảo trì… */
const BLOCKED_PATH_PREFIXES = [
  "/auth",
  "/login",
  "/register",
  "/signup",
  "/onboarding",
  "/pending",
  "/blocked",
  "/locked",
  "/maintenance",
  "/verify-required",
  "/admin",
];

function onBlockedPath(): boolean {
  if (typeof window === "undefined") return true;
  const p = window.location.pathname.toLowerCase();
  return BLOCKED_PATH_PREFIXES.some((x) => p === x || p.startsWith(x + "/") || p.startsWith(x));
}

function hiddenNow(): boolean {
  try {
    const until = Number(localStorage.getItem(HIDE_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

export function RequiredPopup() {
  const { session, me, ready, approvalStatus } = useAuth();
  const loggedIn = Boolean(ready && session && me?.id);

  const accountBlocked =
    Boolean((me as any)?.is_banned) ||
    ["pending", "blocked", "locked", "banned", "rejected", "suspended"].includes(
      String((me as any)?.account_status ?? (me as any)?.status ?? "").toLowerCase(),
    ) ||
    approvalStatus !== "approved";

  const [cfg, setCfg] = useState<RequiredPopupConfig | null>(null);
  const [step, setStep] = useState(1);
  const [fanpageDone, setFanpageDone] = useState(false);
  const [groupDone, setGroupDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!loggedIn || !me?.id) return;
    if (accountBlocked || onBlockedPath()) return;
    if (!isSecondaryConfigured || hiddenNow()) return;
    if (isFollowPopupSuppressed(me.id)) return;
    if (loadedFor.current === me.id) return;
    loadedFor.current = me.id;

    let alive = true;
    void (async () => {
      const c = await fetchRequiredPopup();
      if (!alive || !c.enabled) return;
      const remote = await loadVerifyProgress(me.id!);
      if (remote?.completed_at && Date.now() - remote.completed_at < c.hide_hours * 3600_000) {
        try {
          localStorage.setItem(
            HIDE_KEY,
            String(remote.completed_at + c.hide_hours * 3600_000),
          );
        } catch {
          /* ignore */
        }
        return;
      }
      if (!alive) return;
      setStep(1);
      setFanpageDone(false);
      setGroupDone(false);
      setCfg(c);
    })();
    return () => {
      alive = false;
    };
  }, [loggedIn, me?.id, accountBlocked]);

  // Khoá cuộn nền khi popup mở.
  useEffect(() => {
    if (!cfg || closed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cfg, closed]);

  if (!loggedIn || accountBlocked || !cfg || closed || typeof document === "undefined") return null;

  const openLink = (url: string) => {
    if (url) openExternalLinkWithFeedback(url);
  };

  const finish = () => {
    const now = Date.now();
    try {
      localStorage.setItem(HIDE_KEY, String(now + cfg.hide_hours * 3600_000));
    } catch {
      /* ignore */
    }
    if (me?.id) void saveVerifyProgress(me.id, { step: 2, completed_at: now });
    if (me?.id) markFollowPopupSeen(me.id);
    setClosed(true);
  };

  return createPortal(
    <div className="vw-overlay" role="dialog" aria-modal="true" aria-label="Popup bắt buộc">
      <motion.div
        className="vw-card"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <div className="vw-steps" aria-hidden="true">
          {[1, 2].map((n, i) => (
            <div className="vw-step-wrap" key={n}>
              <span className="vw-dot" data-on={n <= step ? "1" : "0"} data-done={n < step ? "1" : "0"}>
                {n < step ? <Check size={11} strokeWidth={3} /> : n}
              </span>
              {i === 0 ? <span className="vw-line" data-on={step > 1 ? "1" : "0"} /> : null}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" {...fade}>
              <div className="vw-icon vw-icon--fb">
                <Facebook size={24} strokeWidth={2.2} />
              </div>
              <h2 className="vw-title">Tham gia Fanpage Chính Thức</h2>
              <p className="vw-text">
                Theo dõi Fanpage để cập nhật thông báo, sự kiện và thông tin mới nhất.
              </p>
              <button
                type="button"
                className="vw-btn vw-btn--primary"
                onClick={() => {
                  openLink(cfg.fanpage_url);
                  setFanpageDone(true);
                }}
              >
                📘 Tham gia Fanpage
              </button>
              <AnimatePresence>
                {fanpageDone ? (
                  <motion.button
                    type="button"
                    className="vw-btn vw-btn--done"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setStep(2)}
                  >
                    <Check size={15} strokeWidth={3} /> Tiếp tục
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div key="s2" {...fade}>
              <div className="vw-icon vw-icon--group">
                <Users size={24} strokeWidth={2.2} />
              </div>
              <h2 className="vw-title">Tham gia Nhóm Facebook</h2>
              <p className="vw-text">
                Tham gia nhóm để đăng Feedback, giao lưu và nhận hỗ trợ từ cộng đồng.
              </p>
              <button
                type="button"
                className="vw-btn vw-btn--primary"
                onClick={() => {
                  openLink(cfg.facebook_url);
                  setGroupDone(true);
                }}
              >
                👥 Tham gia nhóm Facebook
              </button>
              <AnimatePresence>
                {groupDone ? (
                  <motion.button
                    type="button"
                    className="vw-btn vw-btn--done"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={finish}
                  >
                    <Check size={15} strokeWidth={3} /> Hoàn thành
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="vw-foot">Bước {step}/2</div>
      </motion.div>

      <style>{`
        .vw-overlay{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;
          justify-content:center;padding:16px;overflow:hidden;
          background:radial-gradient(circle at 30% 20%, rgba(122,92,255,.22), transparent 55%),
            radial-gradient(circle at 75% 80%, rgba(255,95,158,.18), transparent 55%),
            rgba(6,8,18,.78);
          backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}

        .vw-card{position:relative;width:100%;max-width:360px;border-radius:22px;
          padding:18px 18px 12px;text-align:center;color:#fff;
          background:linear-gradient(180deg, rgba(28,22,50,.86), rgba(14,12,28,.9));
          border:1px solid rgba(255,255,255,.12);
          box-shadow:0 22px 60px rgba(0,0,0,.5);}
        .vw-card::before{content:"";position:absolute;inset:0;border-radius:22px;padding:1px;
          background:linear-gradient(135deg, rgba(255,95,158,.5), rgba(122,92,255,.15), rgba(122,92,255,.5));
          -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:.75;}
        .vw-card, .vw-card *{color:#fff;}

        .vw-steps{display:flex;align-items:center;justify-content:center;margin-bottom:12px;}
        .vw-step-wrap{display:flex;align-items:center;}
        .vw-dot{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.08);
          border:1.5px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:800;color:rgba(255,255,255,.55);
          transition:all .2s ease;flex-shrink:0;}
        .vw-dot[data-on="1"]{background:linear-gradient(135deg,#ff5f9e,#7a5cff);
          border-color:transparent;color:#fff;}
        .vw-dot[data-done="1"]{background:linear-gradient(135deg,#33d17a,#22b866);}
        .vw-line{width:28px;height:2px;background:rgba(255,255,255,.15);margin:0 4px;
          border-radius:99px;transition:background .2s ease;}
        .vw-line[data-on="1"]{background:linear-gradient(90deg,#7a5cff,#33d17a);}

        .vw-icon{width:48px;height:48px;margin:0 auto 10px;border-radius:16px;display:flex;
          align-items:center;justify-content:center;color:#fff;}
        .vw-icon--fb{background:linear-gradient(135deg,#3b82f6,#7a5cff);}
        .vw-icon--group{background:linear-gradient(135deg,#ff5f9e,#7a5cff);}

        .vw-title{margin:0 0 6px;font-size:17px;font-weight:800;letter-spacing:-.01em;}
        .vw-text{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.7);}

        .vw-btn{width:100%;padding:11px 14px;border-radius:14px;border:0;font-size:14.5px;
          font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;
          gap:8px;transition:transform .15s ease,box-shadow .2s ease;overflow:hidden;}
        .vw-btn+.vw-btn{margin-top:8px;}
        .vw-btn:active{transform:scale(.98);}
        .vw-btn--primary{color:#fff;background:linear-gradient(135deg,#ff5f9e,#7a5cff);
          box-shadow:0 8px 20px rgba(122,92,255,.32);}
        .vw-btn--done, .vw-btn--done *{color:#04140b;}
        .vw-btn--done{background:linear-gradient(135deg,#7dffb0,#33d17a);
          box-shadow:0 8px 20px rgba(51,209,122,.3);}
        .vw-foot{margin-top:10px;font-size:11.5px;color:rgba(255,255,255,.42);}

        @media (max-width:420px){
          .vw-card{padding:16px 14px 10px;border-radius:18px;}
          .vw-title{font-size:16px;}
        }
      `}</style>
    </div>,
    document.body,
  );
}

export default RequiredPopup;
