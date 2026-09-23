/**
 * ComposerPlusMenu — menu nhỏ mở phía trên nút ngọn lửa của thanh nhập tin nhắn.
 * Thuần UI: chỉ phát sự kiện chọn mục, không đụng logic gửi tin nhắn.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Image as ImageIcon, Mic, QrCode, Wallet, Send, ChevronDown, ChevronRight } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { FROM_CARD_ITEMS } from "@/lib/crm-from-card";

export type PlusMenuAction =
  | "ping"
  | "image"
  | "gif"
  | "voice"
  | "edit-card"
  | "coin-transfer"
  | "deposit-no-qr"
  | "deposit-qr"
  | "crm-customer"
  | `from:${string}`;


interface ComposerPlusMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: PlusMenuAction) => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** Chỉ tài khoản admin = true mới thấy 3 mục quản trị. */
  isAdmin?: boolean;
  /** Đã Ping người này rồi → không cho Ping lần nữa. */
  pingDisabled?: boolean;
  crmNotificationCount?: number;
}

const WIDTH = 244;
const GAP = 10;
const MARGIN = 8;

function CoinTransferIcon({ size = 20 }: { size?: number }) {
  const uid = useId();
  const faceId = `coinFace-${uid}`;
  const rimId = `coinRim-${uid}`;
  const shineId = `coinShine-${uid}`;
  const arrowId = `coinArrow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={faceId} cx="35%" cy="30%" r="85%">
          <stop offset="0%" style={{ stopColor: "var(--coin-gold-light)" }} />
          <stop offset="30%" style={{ stopColor: "var(--coin-gold)" }} />
          <stop offset="70%" style={{ stopColor: "var(--coin-gold-mid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--coin-gold-dark)" }} />
        </radialGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--coin-gold)" }} />
          <stop offset="100%" style={{ stopColor: "var(--coin-gold-dark)" }} />
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--coin-arrow-light)", stopOpacity: 0.85 }} />
          <stop offset="100%" style={{ stopColor: "var(--coin-arrow-light)", stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={arrowId} x1="12" y1="4" x2="22" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: "var(--coin-arrow-light)" }} />
          <stop offset="100%" style={{ stopColor: "var(--coin-arrow-warm)" }} />
        </linearGradient>
      </defs>
      {/* outer rim */}
      <circle cx="10.5" cy="13.2" r="8.5" fill={`url(#${rimId})`} stroke="var(--coin-stroke)" strokeWidth="0.5" />
      {/* face */}
      <circle cx="10.5" cy="13.2" r="7.8" fill={`url(#${faceId})`} />
      {/* inner ring */}
      <circle cx="10.5" cy="13.2" r="5.3" fill="none" stroke="var(--coin-arrow-light)" strokeOpacity="0.45" strokeWidth="0.5" />
      {/* glossy highlight */}
      <ellipse cx="8.1" cy="10.2" rx="3.1" ry="1.3" fill={`url(#${shineId})`} opacity="0.75" />
      {/* Xu mark */}
      <text
        x="10.5"
        y="15.7"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="900"
        fill="var(--coin-symbol)"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        X
      </text>
      {/* transfer arrow */}
      <path
        d="M12.8 5.5L19.5 5.5M19.5 5.5L19.5 12.2M19.5 5.5L13.8 11.2"
        stroke={`url(#${arrowId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Luôn neo menu phía trên nút ngọn lửa bằng `bottom`, tính từ mép trên của nút.
 * Nếu không đủ chiều cao thì menu cuộn bên trong, vị trí vẫn nằm trên nút.
 */
function computePosition(anchor: HTMLElement | null) {
  if (!anchor || typeof window === "undefined") {
    return { bottom: 80, left: MARGIN, maxHeight: 400 };
  }
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(vw - WIDTH - MARGIN, Math.max(MARGIN, rect.left));

  // khoảng cách từ đáy viewport tới mép trên nút kích hoạt (+ khoảng hở)
  const bottom = Math.max(MARGIN, vh - rect.top + GAP);
  const maxHeight = Math.max(120, vh - bottom - MARGIN);

  return { bottom, left, maxHeight };
}

export function ComposerPlusMenu({ open, onClose, onSelect, anchorRef, isAdmin = false }: ComposerPlusMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ bottom: -9999, left: -9999, maxHeight: 400 });
  const [mounted, setMounted] = useState(open);
  const [fromOpen, setFromOpen] = useState(false);

  useEffect(() => { if (!open) setFromOpen(false); }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  const reposition = useCallback(() => {
    setPos(computePosition(anchorRef.current));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, onClose, reposition, anchorRef]);

  if (!mounted) return null;

  return (
    <Portal>
      <div
        ref={menuRef}
        className={`composer-plus-menu${open ? " is-open" : " is-closing"}`}
        role="menu"
        aria-label="Tuỳ chọn đính kèm"
        style={{
          top: "auto",
          bottom: pos.bottom,
          left: pos.left,
          width: WIDTH,
          maxHeight: pos.maxHeight,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <button
          type="button"
          role="menuitem"
          className="composer-plus-item"
          onClick={() => onSelect("coin-transfer")}
        >
          <span className="composer-plus-icon composer-plus-icon--coin" aria-hidden>
            <CoinTransferIcon size={20} />
          </span>
          <span className="composer-plus-label">
            <strong>Chuyển Xu</strong>
            <small>Gửi Xu cho người đang chat</small>
          </span>
        </button>
        <div className="composer-plus-divider" aria-hidden />

        <button type="button" role="menuitem" className="composer-plus-item" onClick={() => onSelect("image")}>
          <span className="composer-plus-icon" aria-hidden><ImageIcon size={18} /></span>
          <span className="composer-plus-label"><strong>Gửi ảnh</strong></span>
        </button>
        <button type="button" role="menuitem" className="composer-plus-item" onClick={() => onSelect("gif")}>
          <span className="composer-plus-icon composer-plus-icon-text" aria-hidden>GIF</span>
          <span className="composer-plus-label"><strong>Gửi GIF</strong></span>
        </button>
        <button type="button" role="menuitem" className="composer-plus-item" onClick={() => onSelect("voice")}>
          <span className="composer-plus-icon" aria-hidden><Mic size={18} /></span>
          <span className="composer-plus-label"><strong>Gửi voice</strong></span>
        </button>
        {isAdmin ? (
          <>
            <button type="button" role="menuitem" className="composer-plus-item" onClick={() => onSelect("deposit-no-qr")}>
              <span className="composer-plus-icon" aria-hidden><Wallet size={18} /></span>
              Tạo lệnh nạp không mã QR
            </button>
            <button type="button" role="menuitem" className="composer-plus-item" onClick={() => onSelect("deposit-qr")}>
              <span className="composer-plus-icon" aria-hidden><QrCode size={18} /></span>
              Tạo lệnh nạp có mã QR
            </button>

            <button
              type="button"
              role="menuitem"
              className="composer-plus-item"
              aria-expanded={fromOpen}
              onClick={() => setFromOpen((v) => !v)}
            >
              <span className="composer-plus-icon" aria-hidden><Send size={18} /></span>
              <span className="composer-plus-label"><strong>FROM</strong><small>Gửi Card cho khách đang chat</small></span>
              <span className="composer-plus-icon" aria-hidden>
                {fromOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
            {fromOpen ? (
              <div style={{ paddingLeft: 10 }}>
                {FROM_CARD_ITEMS.map((item) =>
                  item.kind === "manual" ? (
                    <div key={item.id} className="composer-plus-item" style={{ opacity: 0.75, cursor: "default" }}>
                      <span className="composer-plus-icon composer-plus-icon-text" aria-hidden>{item.icon}</span>
                      <span className="composer-plus-label">
                        <strong>{item.menuLabel}</strong>
                        <small>MỒI — Admin tự nhắn ở ô nhập tin nhắn</small>
                      </span>
                    </div>
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="composer-plus-item"
                      onClick={() => onSelect(`from:${item.id}`)}
                    >
                      <span className="composer-plus-icon composer-plus-icon-text" aria-hidden>{item.icon}</span>
                      <span className="composer-plus-label">
                        <strong>{item.menuLabel}</strong>
                        <small>{item.kind === "card" ? "Gửi Card" : "Gửi tin nhắn soạn sẵn"}</small>
                      </span>
                    </button>
                  ),
                )}
              </div>
            ) : null}

          </>
        ) : null}
      </div>
    </Portal>
  );
}
