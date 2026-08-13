/**
 * Popup xác minh người dùng — WIZARD 3 BƯỚC (chỉ hiện SAU khi đăng nhập).
 *
 * Bước 1: xác nhận 18+   → tick checkbox mới bật nút "Tiếp tục"
 * Bước 2: theo dõi Fanpage → bấm nút mở link → tự sang bước 3
 * Bước 3: kết bạn Facebook Admin → bấm nút mở link → hiện nút "Hoàn thành"
 *
 * Hoàn thành → đóng popup, lưu timestamp, ẩn trong `hide_hours` giờ.
 *
 * Tối ưu: đọc cấu hình đúng 1 lần / phiên. Không websocket, không polling,
 * không ghi liên tục — chỉ ghi khi đổi bước và khi hoàn thành.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, Facebook, UserPlus, Check } from "lucide-react";
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
// KHÔNG lưu bước hiện tại ở bất cứ đâu (localStorage / session / cookie / Supabase).
// Chỉ lưu thời điểm hoàn thành → wizard luôn reset về Bước 1 khi hiện lại.

function hiddenNow(): boolean {
  try {
    const until = Number(localStorage.getItem(HIDE_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

const fade = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -16, scale: 0.98 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const STEP_META = [
  { key: 1, label: "Xác minh" },
  { key: 2, label: "Fanpage" },
  { key: 3, label: "Kết bạn" },
];

export function RequiredPopup() {
  const { session, me, ready } = useAuth();
  const loggedIn = Boolean(ready && session && me?.id);

  const [cfg, setCfg] = useState<RequiredPopupConfig | null>(null);
  const [step, setStep] = useState(1);
  const [agree, setAgree] = useState(false);
  const [fanpageDone, setFanpageDone] = useState(false);
  const [fbDone, setFbDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Chỉ tải cấu hình SAU khi đăng nhập thành công (không hiện ở Login/Register).
  useEffect(() => {
    if (!loggedIn || !me?.id) return;
    if (!isSecondaryConfigured || hiddenNow()) return;
    // UI V4: không hiện sau khi đăng ký, và mỗi tài khoản chỉ hiện đúng 1 lần.
    if (isFollowPopupSuppressed(me.id)) return;
    if (loadedFor.current === me.id) return;
    loadedFor.current = me.id;

    let alive = true;
    void (async () => {
      const c = await fetchRequiredPopup();
      if (!alive || !c.enabled) return;
      // Chỉ kiểm tra thời gian ẩn (1 lần / phiên). Không khôi phục bước cũ.
      const remote = await loadVerifyProgress(me.id!);
      if (remote?.completed_at && Date.now() - remote.completed_at < c.hide_hours * 3600_000) {
        // Đồng bộ lại mốc ẩn cho thiết bị này để lần sau không cần đọc DB.
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
      // LUÔN bắt đầu lại từ Bước 1.
      setStep(1);
      setAgree(false);
      setFanpageDone(false);
      setFbDone(false);
      setCfg(c);
    })();
    return () => {
      alive = false;
    };
  }, [loggedIn, me?.id]);

  // Khoá cuộn nền khi popup mở.
  useEffect(() => {
    if (!cfg || closed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cfg, closed]);

  if (!loggedIn || !cfg || closed || typeof document === "undefined") return null;

  // Chuyển bước chỉ trong bộ nhớ (state) — không ghi localStorage / Supabase.
  const goto = (next: number) => setStep(next);

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
    // Chỉ lưu mốc hoàn thành (không lưu bước).
    if (me?.id) void saveVerifyProgress(me.id, { step: 3, completed_at: now });
    if (me?.id) markFollowPopupSeen(me.id);
    setClosed(true);
  };

  /** "Để sau" — đóng popup, không hiện lại cho tài khoản này. */
  const dismiss = () => {
    if (me?.id) markFollowPopupSeen(me.id);
    setClosed(true);
  };


  return createPortal(
    <div className="vw-overlay" role="dialog" aria-modal="true" aria-label="Xác minh người dùng">
      <motion.div
        className="vw-glow vw-glow--a"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        aria-hidden="true"
      />
      <motion.div
        className="vw-glow vw-glow--b"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        aria-hidden="true"
      />
      <motion.div
        className="vw-card"
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vw-steps" aria-hidden="true">
          {STEP_META.map((s, i) => (
            <div className="vw-step-wrap" key={s.key}>
              <span
                className="vw-dot"
                data-on={s.key <= step ? "1" : "0"}
                data-done={s.key < step ? "1" : "0"}
              >
                {s.key < step ? <Check size={12} strokeWidth={3} /> : s.key}
              </span>
              {i < STEP_META.length - 1 ? (
                <span className="vw-line" data-on={s.key < step ? "1" : "0"} />
              ) : null}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" {...fade}>
              <div className="vw-icon vw-icon--shield">
                <ShieldCheck size={30} strokeWidth={2.2} />
              </div>
              <h2 className="vw-title">Xác minh bạn là người dùng thật</h2>
              <p className="vw-text">
                Để tiếp tục sử dụng website,
                <br />
                vui lòng xác nhận bạn đã đủ 18 tuổi.
              </p>
              <label className="vw-check">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span className="vw-checkbox" data-on={agree ? "1" : "0"}>
                  <Check size={13} strokeWidth={3} />
                </span>
                <span>Tôi xác nhận tôi đã đủ 18 tuổi.</span>
              </label>
              <button
                type="button"
                className="vw-btn vw-btn--primary"
                disabled={!agree}
                onClick={() => goto(2)}
              >
                Tiếp tục
              </button>
            </motion.div>
          ) : null}

          {step === 2 ? (
            <motion.div key="s2" {...fade}>
              <div className="vw-icon vw-icon--fb">
                <Facebook size={30} strokeWidth={2.2} />
              </div>
              <h2 className="vw-title">📣 Theo dõi Fanpage</h2>
              <p className="vw-text">Nhận thông báo mới nhất từ Fanpage chính thức.</p>
              <ul className="fp-list">
                <li>🎉 Sự kiện</li>
                <li>🎁 Quà tặng</li>
                <li>🎮 Mini game</li>
              </ul>
              <button
                type="button"
                className="vw-btn vw-btn--primary"
                onClick={() => {
                  openLink(cfg.fanpage_url);
                  setFanpageDone(true);
                }}
              >
                Tham gia Fanpage Admin
              </button>
              <AnimatePresence>
                {fanpageDone ? (
                  <motion.button
                    type="button"
                    className="vw-btn vw-btn--done"
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.22 }}
                    onClick={() => goto(3)}
                  >
                    <Check size={16} strokeWidth={3} /> Tiếp tục
                  </motion.button>
                ) : null}
              </AnimatePresence>

            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div key="s3" {...fade}>
              <div className="vw-icon vw-icon--user">
                <UserPlus size={30} strokeWidth={2.2} />
              </div>
              <h2 className="vw-title">Kết bạn Facebook Admin</h2>
              <p className="vw-text">
                Nếu cần hỗ trợ,
                <br />
                hãy kết bạn Facebook với Admin.
              </p>
              <button
                type="button"
                className="vw-btn vw-btn--primary"
                onClick={() => {
                  openLink(cfg.facebook_url);
                  setFbDone(true);
                }}
              >
                Kết bạn Facebook
              </button>
              <AnimatePresence>
                {fbDone ? (
                  <motion.button
                    type="button"
                    className="vw-btn vw-btn--done"
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.22 }}
                    onClick={finish}
                  >
                    <Check size={16} strokeWidth={3} /> Hoàn thành
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <button type="button" className="fp-btn fp-btn--ghost" onClick={dismiss}>
          Để sau
        </button>

        <div className="vw-foot">
          Bước {step}/3 {fanpageDone && step === 3 ? "• Đã mở Fanpage" : ""}
        </div>
      </motion.div>

      <style>{`
        .vw-overlay{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;
          justify-content:center;padding:16px;overflow:hidden;
          background:radial-gradient(circle at 30% 20%, rgba(122,92,255,.25), transparent 55%),
            radial-gradient(circle at 75% 80%, rgba(255,95,158,.22), transparent 55%),
            rgba(6,8,18,.78);
          backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}

        .vw-glow{position:absolute;border-radius:50%;filter:blur(60px);pointer-events:none;}
        .vw-glow--a{width:280px;height:280px;top:-60px;left:-60px;
          background:radial-gradient(circle, rgba(255,95,158,.35), transparent 70%);}
        .vw-glow--b{width:320px;height:320px;bottom:-80px;right:-60px;
          background:radial-gradient(circle, rgba(122,92,255,.35), transparent 70%);}

        .vw-card{position:relative;width:100%;max-width:400px;border-radius:28px;
          padding:28px 24px 20px;text-align:center;color:#fff;
          background:linear-gradient(180deg, rgba(28,22,50,.72), rgba(14,12,28,.78));
          border:1px solid rgba(255,255,255,.14);
          box-shadow:0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08);
          backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
          overflow:hidden;}
        .vw-card::before{content:"";position:absolute;inset:0;border-radius:28px;padding:1px;
          background:linear-gradient(135deg, rgba(255,95,158,.5), rgba(122,92,255,.15), rgba(122,92,255,.5));
          -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:.8;}
        .vw-card, .vw-card *{color:#fff;}

        .vw-steps{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:22px;
          position:relative;}
        .vw-step-wrap{display:flex;align-items:center;}
        .vw-dot{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);
          border:1.5px solid rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:800;color:rgba(255,255,255,.55);
          transition:all .3s ease;flex-shrink:0;}
        .vw-dot[data-on="1"]{background:linear-gradient(135deg,#ff5f9e,#7a5cff);
          border-color:transparent;color:#fff;
          box-shadow:0 0 0 4px rgba(122,92,255,.18), 0 4px 14px rgba(255,95,158,.35);}
        .vw-dot[data-done="1"]{background:linear-gradient(135deg,#33d17a,#22b866);
          box-shadow:0 0 0 4px rgba(51,209,122,.16), 0 4px 14px rgba(51,209,122,.3);}
        .vw-line{width:34px;height:2.5px;background:rgba(255,255,255,.15);margin:0 4px;
          border-radius:99px;transition:background .3s ease;}
        .vw-line[data-on="1"]{background:linear-gradient(90deg,#7a5cff,#33d17a);}

        .vw-icon{width:66px;height:66px;margin:0 auto 16px;border-radius:22px;display:flex;
          align-items:center;justify-content:center;color:#fff;position:relative;
          animation:vw-pop .45s cubic-bezier(.34,1.56,.64,1);}
        .vw-icon::after{content:"";position:absolute;inset:-8px;border-radius:26px;
          background:inherit;opacity:.35;filter:blur(14px);z-index:-1;}
        .vw-icon--shield{background:linear-gradient(135deg,#ff5f9e,#7a5cff);}
        .vw-icon--fb{background:linear-gradient(135deg,#3b82f6,#7a5cff);}
        .vw-icon--user{background:linear-gradient(135deg,#33d17a,#3b82f6);}
        @keyframes vw-pop{0%{transform:scale(.5) rotate(-8deg);opacity:0;}
          100%{transform:scale(1) rotate(0);opacity:1;}}

        .vw-title{margin:0 0 10px;font-size:20px;font-weight:800;color:#fff;letter-spacing:-.01em;}
        .vw-text{margin:0 0 18px;font-size:14.5px;line-height:1.6;
          color:rgba(255,255,255,.72);}
        .vw-check{display:flex;align-items:center;gap:10px;justify-content:center;
          margin-bottom:18px;font-size:14px;cursor:pointer;color:#fff;user-select:none;}
        .vw-check span{color:#fff;}
        .vw-check input[type="checkbox"]{position:absolute;opacity:0;width:0;height:0;}
        .vw-checkbox{width:22px;height:22px;border-radius:8px;border:1.5px solid rgba(255,255,255,.3);
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
          background:rgba(255,255,255,.06);transition:all .2s ease;}
        .vw-checkbox[data-on="1"]{background:linear-gradient(135deg,#ff5f9e,#7a5cff);
          border-color:transparent;box-shadow:0 4px 12px rgba(122,92,255,.4);}
        .vw-checkbox svg{opacity:0;transform:scale(.5);transition:all .18s ease;}
        .vw-checkbox[data-on="1"] svg{opacity:1;transform:scale(1);}

        .vw-btn{width:100%;padding:13px 14px;border-radius:16px;border:0;font-size:15px;
          font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;
          gap:8px;transition:transform .15s ease,opacity .15s ease,box-shadow .2s ease;
          overflow:hidden;}
        .vw-btn+.vw-btn{margin-top:10px;}
        .vw-btn:active{transform:scale(.97);}
        .vw-btn--primary{color:#fff;background:linear-gradient(135deg,#ff5f9e,#7a5cff);
          box-shadow:0 8px 22px rgba(122,92,255,.35);}
        .vw-btn--primary:hover:not(:disabled){box-shadow:0 10px 26px rgba(122,92,255,.5);}
        .vw-btn--primary:disabled{opacity:.4;cursor:not-allowed;box-shadow:none;}
        .vw-btn--done, .vw-btn--done *{color:#04140b;}
        .vw-btn--done{background:linear-gradient(135deg,#7dffb0,#33d17a);
          box-shadow:0 8px 22px rgba(51,209,122,.35);}
        .vw-btn--done:hover{box-shadow:0 10px 26px rgba(51,209,122,.5);}
        .vw-foot{margin-top:16px;font-size:12px;color:rgba(255,255,255,.45);}

        @media (max-width:420px){
          .vw-card{padding:24px 18px 16px;border-radius:22px;}
          .vw-icon{width:58px;height:58px;border-radius:18px;}
          .vw-title{font-size:18px;}
          .vw-line{width:24px;}
        }
      `}</style>
    </div>,
    document.body,
  );
}

export default RequiredPopup;
