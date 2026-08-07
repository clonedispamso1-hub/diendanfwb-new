import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";

interface ChainLockOverlayProps {
  locked: boolean;
  onUnlockRequest: () => void;
  children: React.ReactNode;
}

/**
 * Lớp phủ "xích khoá" — chỉ khoá phần nội dung được bọc (không che toàn
 * trang). Bấm vào xích/ổ khoá sẽ gọi onUnlockRequest. Khi mở khoá, xích sẽ
 * bung/đứt ra với hiệu ứng trước khi nội dung hoạt động lại bình thường.
 */
export function ChainLockOverlay({ locked, onUnlockRequest, children }: ChainLockOverlayProps) {
  const [bursting, setBursting] = useState(false);

  const handleClick = () => {
    if (bursting) return;
    onUnlockRequest();
  };

  return (
    <div className="chain-lock-wrap" data-locked={locked ? "true" : "false"}>
      <div className={locked ? "chain-lock-content is-locked" : "chain-lock-content"}>
        {children}
      </div>
      <AnimatePresence
        onExitComplete={() => setBursting(false)}
      >
        {locked ? (
          <motion.div
            className="chain-lock-overlay"
            role="button"
            tabIndex={0}
            aria-label="Hồ sơ đang bị khoá do không hoạt động — bấm để mở khoá"
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleClick();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35, delay: 0.25 } }}
          >
            <ChainLine
              className="chain-line chain-line-1"
              burst={bursting}
              onAnimationStart={() => {}}
            />
            <ChainLine className="chain-line chain-line-2" burst={bursting} reverse />
            <ChainLine className="chain-line chain-line-3" burst={bursting} />

            <motion.div
              className="chain-lock-badge"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.3, opacity: 0, transition: { duration: 0.3 } }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                setBursting(true);
                handleClick();
              }}
            >
              <Lock size={20} />
              <span className="chain-lock-badge-text">Mở khoá hồ sơ</span>
            </motion.div>

            <div className="chain-lock-hint">
              Hồ sơ tạm khoá vì bạn không hoạt động &gt; 2 giờ
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ChainLink() {
  return (
    <svg viewBox="0 0 40 20" className="chain-link-svg" aria-hidden="true">
      <ellipse cx="11" cy="10" rx="9" ry="7" fill="none" stroke="currentColor" strokeWidth="4" />
      <ellipse cx="29" cy="10" rx="9" ry="7" fill="none" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}

function ChainLine({
  className,
  burst,
  reverse,
}: {
  className: string;
  burst: boolean;
  reverse?: boolean;
  onAnimationStart?: () => void;
}) {
  const links = Array.from({ length: 9 });
  return (
    <motion.div
      className={className}
      initial={{ x: 0 }}
      animate={
        burst
          ? {
              x: reverse ? 220 : -220,
              y: reverse ? -60 : 60,
              rotate: reverse ? 40 : -40,
              opacity: 0,
              transition: { duration: 0.5, ease: "easeIn" },
            }
          : {
              rotate: [0, -1.2, 1.2, -0.6, 0.6, 0],
              transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
            }
      }
    >
      {links.map((_, i) => (
        <ChainLink key={i} />
      ))}
    </motion.div>
  );
}
