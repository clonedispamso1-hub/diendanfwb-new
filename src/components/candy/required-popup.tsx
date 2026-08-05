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
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

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
    setClosed(true);
  };


  return createPortal(
    <div className="vw-overlay" role="dialog" aria-modal="true" aria-label="Xác minh người dùng">
      <motion.div
        className="vw-card"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.26, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vw-steps" aria-hidden="true">
          {[1, 2, 3].map((s) => (
            <span key={s} className="vw-dot" data-on={s <= step ? "1" : "0"} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" {...fade}>
              <div className="vw-icon">
                <ShieldCheck size={26} />
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
              <div className="vw-icon">
                <Facebook size={26} />
              </div>
              <h2 className="vw-title">Theo dõi Fanpage</h2>
              <p className="vw-text">
                Để cập nhật các thông báo mới nhất,
                <br />
                vui lòng theo dõi Fanpage chính thức.
              </p>
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
              {fanpageDone ? (
                <motion.button
                  type="button"
                  className="vw-btn vw-btn--done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => goto(3)}
                >
                  <Check size={16} /> Tiếp tục
                </motion.button>
              ) : null}

            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div key="s3" {...fade}>
              <div className="vw-icon">
                <UserPlus size={26} />
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
              {fbDone ? (
                <motion.button
                  type="button"
                  className="vw-btn vw-btn--done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={finish}
                >
                  <Check size={16} /> Hoàn thành
                </motion.button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="vw-foot">
          Bước {step}/3 {fanpageDone && step === 3 ? "• Đã mở Fanpage" : ""}
        </div>
      </motion.div>

      <style>{`
        .vw-overlay{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;
          justify-content:center;padding:16px;background:rgba(8,11,24,.68);
          backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
        .vw-card{width:100%;max-width:390px;border-radius:20px;padding:24px 22px 18px;
          text-align:center;background:var(--ui-card,#12162a);color:#fff;
          border:1px solid rgba(255,255,255,.09);box-shadow:0 24px 60px rgba(0,0,0,.45);}
        .vw-card, .vw-card *{color:#fff;}
        .vw-steps{display:flex;gap:6px;justify-content:center;margin-bottom:16px;}
        .vw-dot{width:26px;height:4px;border-radius:99px;background:rgba(255,255,255,.18);
          transition:background .25s ease;}
        .vw-dot[data-on="1"]{background:linear-gradient(90deg,#ff5f9e,#7a5cff);}
        .vw-icon{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;display:flex;
          align-items:center;justify-content:center;color:#fff;
          background:linear-gradient(135deg,#ff5f9e,#7a5cff);}
        .vw-title{margin:0 0 8px;font-size:19px;font-weight:800;color:#FFFFFF;}
        .vw-text{margin:0 0 16px;font-size:14.5px;line-height:1.55;opacity:1;
          color:rgba(255,255,255,.9);}
        .vw-check{display:flex;align-items:center;gap:9px;justify-content:center;
          margin-bottom:16px;font-size:14px;cursor:pointer;color:#FFFFFF;}
        .vw-check span{color:#FFFFFF;}
        .vw-check input[type="checkbox"]{accent-color:#ff5f9e;width:16px;height:16px;}
        .vw-btn{width:100%;padding:12px 14px;border-radius:12px;border:0;font-size:15px;
          font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;
          gap:8px;transition:transform .15s ease,opacity .15s ease;}
        .vw-btn+.vw-btn{margin-top:10px;}
        .vw-btn:active{transform:scale(.98);}
        .vw-btn--primary{color:#fff;background:linear-gradient(135deg,#ff5f9e,#7a5cff);}
        .vw-btn--primary:disabled{opacity:.45;cursor:not-allowed;}
        .vw-btn--done, .vw-btn--done *{color:#04140b;}
        .vw-btn--done{background:linear-gradient(135deg,#7dffb0,#33d17a);}
        .vw-foot{margin-top:14px;font-size:12px;opacity:1;color:rgba(255,255,255,.6);}

      `}</style>
    </div>,
    document.body,
  );
}

export default RequiredPopup;
