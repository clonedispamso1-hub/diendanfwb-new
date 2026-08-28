/**
 * Floating Dock — 3 ô icon trắng xếp dọc, cố định mé phải (KHÔNG kéo thả).
 * - Facebook / Zalo → popup có tối đa 2 nút do Admin cấu hình (tên · link · màu).
 * - Game Xu → điều hướng thẳng sang trang Rút tiền (/wallet/withdraw), không popup.
 * Cấu hình trong Admin Panel → "Bảo Đẹp Trai".
 */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Portal } from "@/components/candy/portal";
import {
  DOCK_DEFAULT,
  FLOATING_DOCK_EVENT,
  loadDockCfg,
  type DockCfg,
  type DockItemId,
} from "@/lib/floating-dock-config";
import {
  DOCK_TIPS,
  RETURNING_INTERVAL,
  TIP_DURATION,
  isContentNew,
  isNewVisitor,
  markContentSeen,
  markShown,
  markVisited,
  nextGap,
  pickRandom,
  shownThisSession,
  type TipId,
} from "@/lib/dock-tooltips";
import { useDockHidden } from "@/lib/dock-visibility";
import { useDockPeek } from "@/lib/dock-peek";
import { useAuth } from "@/components/candy/auth-provider";
import { markFollowersSeen, useNewFollowerCount } from "@/lib/new-followers";
import { markTransfersSeen, useNewTransferCount } from "@/lib/new-transfers";
import { AppLoadingOverlay } from "@/components/candy/app-loading";
import "@/styles/floating-dock.css";

const FollowersSheet = lazy(() =>
  import("@/components/candy/followers-sheet").then((m) => ({ default: m.FollowersSheet })),
);

function FacebookLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="11" fill="#1877f2" />
      <path
        fill="#fff"
        d="M13.5 21.9V14.2h2.6l.5-3.03h-3.1V9.2c0-.87.24-1.47 1.5-1.47h1.7V5.02c-.3-.04-1.3-.13-2.47-.13-2.45 0-4.13 1.5-4.13 4.24v2.04H7.4v3.03h2.7v7.7h3.4z"
      />
    </svg>
  );
}
function ZaloLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false">
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#0068ff" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontFamily="Arial Rounded MT Bold, Arial, Helvetica, sans-serif"
        fontSize="16"
        fontWeight="700"
        fill="#fff"
      >
        Zalo
      </text>
    </svg>
  );
}

/** Hiệu ứng ripple khi bấm. */
function ripple(e: React.MouseEvent<HTMLElement>) {
  const host = e.currentTarget;
  const rect = host.getBoundingClientRect();
  const span = document.createElement("span");
  const size = Math.max(rect.width, rect.height) * 1.6;
  span.className = "fd-ripple";
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${e.clientX - rect.left - size / 2}px`;
  span.style.top = `${e.clientY - rect.top - size / 2}px`;
  host.appendChild(span);
  window.setTimeout(() => span.remove(), 620);
}

/* ------------------------------ Popup shell ------------------------------ */
function PopupShell({
  title,
  accent,
  onClose,
  children,
}: {
  title: string;
  accent?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fdp__mask" onClick={onClose} role="presentation">
        <div
          className="fdp__card"
          role="dialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          style={{ ["--fdp-accent" as string]: accent || "#1877f2" }}
        >
          <div className="fdp__head">
            <h3 className="fdp__title">{title}</h3>
            <button type="button" className="fdp__x" onClick={onClose} aria-label="Đóng">
              <X size={15} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function LinkButton({ label, url, color }: { label: string; url: string; color: string }) {
  if (!url) return null;
  return (
    <a
      className="fdp__btn fdp__btn--filled"
      style={{ ["--fdp-btn" as string]: color }}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={ripple}
    >
      {label}
    </a>
  );
}

/** Popup chọn giữa 2 link (chỉ hiện khi Admin gán đủ 2 link). */
function ChoicePopup({
  title,
  accent,
  avatar,
  name,
  qr,
  options,
  onClose,
}: {
  title: string;
  accent: string;
  avatar?: string;
  name?: string;
  qr?: string;
  options: Array<{ label: string; url: string }>;
  onClose: () => void;
}) {
  return (
    <PopupShell title={title} accent={accent} onClose={onClose}>
      <div className="fdp__avatar">
        {avatar ? <img decoding="async" src={avatar} alt="" loading="lazy" /> : <span aria-hidden>🔗</span>}
      </div>
      {name ? <p className="fdp__name">{name}</p> : null}
      {qr ? <img decoding="async" className="fdp__qr" src={qr} alt="Mã QR" loading="lazy" /> : null}
      {options.map((o) => (
        <LinkButton key={o.label} label={o.label} url={o.url} color={accent} />
      ))}
    </PopupShell>
  );
}

/* ------------------------------ Dock ------------------------------ */
export function FloatingDock() {
  const [cfg, setCfg] = useState<DockCfg | null>(null);
  const [open, setOpen] = useState<Exclude<DockItemId, "gamexu"> | null>(null);
  const [tip, setTip] = useState<TipId | null>(null);
  const [showFollowers, setShowFollowers] = useState(false);
  const [newIds, setNewIds] = useState<TipId[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  // UI: màn Tin nhắn (/chat), Feedback (/feedback), Live Móc (/guide) không
  // hiển thị 2 icon "Chuyển tiền" (Game Xu) và "Theo dõi". Chỉ ẩn UI,
  // backend/function giữ nguyên.
  const hideQuickIcons = ["/chat", "/feedback", "/guide", "/ket-noi", "/huong-dan"].some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
  );
  // Facebook & Zalo chỉ hiện ở Trang chủ (/) và Hồ sơ (/profile).
  const allowSocial =
    location.pathname === "/" ||
    location.pathname === "/profile" ||
    location.pathname.startsWith("/profile/");
  const dockHidden = useDockHidden();
  const dockPeek = useDockPeek();
  const { me } = useAuth();
  const newFollowers = useNewFollowerCount(me?.id ?? null);
  // Badge đỏ "+N" trên icon Game Xu khi có giao dịch chuyển tiền mới chưa đọc.
  const newTransfers = useNewTransferCount(me?.id ?? null);

  const refresh = useCallback(() => { void loadDockCfg().then(setCfg); }, []);

  useEffect(() => {
    refresh();
    const onChanged = () => refresh();
    window.addEventListener(FLOATING_DOCK_EVENT, onChanged);
    return () => window.removeEventListener(FLOATING_DOCK_EVENT, onChanged);
  }, [refresh]);

  const c = cfg ?? DOCK_DEFAULT;

  const fbLinks = [
    { label: "Fanpage Admin", url: (c.facebook.url || "").trim() },
    { label: "Vào Nhóm Facebook", url: (c.facebook.url2 || "").trim() },
  ].filter((l) => !!l.url);
  const zaLinks = [
    { label: "Zalo Admin", url: (c.zalo.chatUrl || "").trim() },
    { label: "Nhóm Zalo", url: (c.zalo.groupUrl || "").trim() },
  ].filter((l) => !!l.url);

  const items = !cfg
    ? []
    : (c.order
        .map((id) => {
          if (id === "facebook") {
            if (!allowSocial) return null;
            if (!c.facebook.enabled || !fbLinks.length) return null;
            return { id, label: c.facebook.name || "Facebook", icon: c.facebook.icon, logo: <FacebookLogo />, size: c.facebook.size };
          }
          if (id === "zalo") {
            if (!allowSocial) return null;
            if (!c.zalo.enabled || !zaLinks.length) return null;
            return { id, label: c.zalo.name || "Zalo", icon: c.zalo.icon, logo: <ZaloLogo />, size: c.zalo.size };
          }
          if (id === "follow") {
            if (hideQuickIcons) return null;
            if (!c.follow.enabled || !me?.id) return null;
            return {
              id,
              label: c.follow.label || "Theo dõi",
              icon: c.follow.icon,
              logo: <span aria-hidden style={{ fontSize: 24 }}>❤️</span>,
              size: c.follow.size,
            };
          }
          if (hideQuickIcons) return null;
          if (!c.gamexu.enabled) return null;
          return {
            id,
            label: c.gamexu.label || "Game Xu",
            icon: c.gamexu.icon,
            logo: <span aria-hidden style={{ fontSize: 24 }}>🪙</span>,
            size: c.gamexu.size,
          };
        })
        .filter(Boolean) as Array<{ id: DockItemId; label: string; icon: string; logo: React.ReactNode; size?: number }>);

  const idsKey = items.map((i) => i.id).join(",");

  /** Nội dung admin theo từng icon — dùng để phát hiện thay đổi (badge NEW). */
  const contentOf = useCallback(
    (id: TipId) => {
      if (id === "facebook") return { u: c.facebook.url, u2: c.facebook.url2, n: c.facebook.name };
      if (id === "zalo") return { u: c.zalo.chatUrl, g: c.zalo.groupUrl, n: c.zalo.name };
      if (id === "gamexu") return { l: c.gamexu.label };
      if (id === "follow") return { l: c.follow.label, s: c.follow.size };
      return null;
    },
    [c],
  );

  // Badge NEW khi admin đổi nội dung
  useEffect(() => {
    if (!cfg) return;
    const ids = idsKey ? (idsKey.split(",") as TipId[]) : [];
    setNewIds(ids.filter((id) => isContentNew(id, contentOf(id))));
  }, [cfg, idsKey, contentOf]);

  // Lịch hiển thị tooltip (chỉ setTimeout, tự hủy khi unmount)
  useEffect(() => {
    if (!cfg || !idsKey) return;
    const pool = idsKey.split(",") as TipId[];
    const timers: number[] = [];
    let last: TipId | null = null;
    let alive = true;

    const show = (id: TipId) => {
      if (!alive) return;
      setTip(id);
      last = id;
      markShown(id);
      timers.push(window.setTimeout(() => alive && setTip(null), TIP_DURATION));
    };

    if (isNewVisitor()) {
      const remaining = () => pool.filter((id) => !shownThisSession().includes(id));
      const step = (delay: number) => {
        timers.push(
          window.setTimeout(() => {
            if (!alive) return;
            const id = pickRandom(remaining(), last);
            if (!id) return;
            show(id);
            if (remaining().length) step(TIP_DURATION + nextGap());
          }, delay),
        );
      };
      step(2500);
      markVisited();
    } else {
      const loop = () => {
        timers.push(
          window.setTimeout(() => {
            if (!alive) return;
            const id = pickRandom(pool, last);
            if (id) show(id);
            loop();
          }, RETURNING_INTERVAL),
        );
      };
      loop();
    }

    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [cfg, idsKey]);

  if (!cfg || !c.enabled || !c.visible) return null;
  if (!items.length) return null;

  return (
    <>
      <Portal>
        <div
          className={`fdock${open || showFollowers ? " is-behind" : ""}${dockHidden ? " is-hidden" : ""}${dockPeek && !open && !showFollowers ? " is-peek" : ""}`}
          aria-hidden={dockHidden || open != null || showFollowers || undefined}
          aria-label="Liên kết nhanh"
        >
          <div className="fdock__inner">
            {items.map((it, i) => (
              <div key={it.id} className="fdock__slot">
                {tip === (it.id as TipId) ? (
                  <span className="fdock__tip" role="status">
                    {DOCK_TIPS[it.id as TipId]}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={`fdock__tile${c.attention ? " is-attention" : ""}${
                    newIds.includes(it.id as TipId) ? " is-new" : ""
                  }`}
                  style={{
                    ["--fd-delay" as string]: `${i * 0.6}s`,
                    ...(it.size ? { width: it.size, height: it.size, minWidth: it.size } : null),
                  }}
                  aria-label={it.label}
                  title={it.label}
                  onClick={(e) => {
                    ripple(e);
                    setTip(null);
                    if (newIds.includes(it.id as TipId)) {
                      markContentSeen(it.id as TipId, contentOf(it.id as TipId));
                      setNewIds((prev) => prev.filter((x) => x !== it.id));
                    }
                    if (it.id === "gamexu") {
                      markTransfersSeen();
                      navigate("/wallet/withdraw");
                    }
                    else if (it.id === "follow") {
                      markFollowersSeen();
                      setShowFollowers(true);
                    } else {
                      const links = it.id === "facebook" ? fbLinks : zaLinks;
                      if (links.length === 1) window.open(links[0].url, "_blank", "noopener,noreferrer");
                      else if (links.length > 1) setOpen(it.id as "facebook" | "zalo");
                    }
                  }}
                >
                  <span className="fdock__ico">
                    {/^(https?:\/\/|data:image\/)/i.test(it.icon)
                      ? <img decoding="async" src={it.icon} alt="" loading="lazy" />
                      : it.icon
                        ? <span aria-hidden>{it.icon}</span>
                        : it.logo}
                  </span>
                  {it.id === "gamexu" && newTransfers > 0 ? (
                    <span
                      key={`tf-${newTransfers}`}
                      className="fdock__follow-badge"
                      aria-label={`${newTransfers} giao dịch chuyển tiền mới`}
                    >
                      +{newTransfers > 99 ? "99" : newTransfers}
                    </span>
                  ) : null}
                  {it.id === "follow" && newFollowers > 0 ? (
                    <span
                      key={`fw-${newFollowers}`}
                      className="fdock__follow-badge"
                      aria-label={`${newFollowers} người theo dõi mới`}
                    >
                      +{newFollowers > 99 ? "99" : newFollowers}
                    </span>
                  ) : null}
                  {it.id !== "follow" && it.id !== "gamexu" && newIds.includes(it.id as TipId) ? <span className="fdock__new" aria-hidden>NEW</span> : null}
                </button>
              </div>
            ))}
          </div>
        </div>
      </Portal>

      {open === "facebook" ? (
        <ChoicePopup
          title={c.facebook.popupTitle || c.facebook.name || "Facebook"}
          accent={c.facebook.color || "#1877f2"}
          avatar={c.facebook.avatar}
          name={c.facebook.name}
          options={fbLinks}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === "zalo" ? (
        <ChoicePopup
          title={c.zalo.popupTitle || c.zalo.name || "Zalo"}
          accent={c.zalo.color || "#0068ff"}
          avatar={c.zalo.avatar}
          name={c.zalo.name}
          qr={c.zalo.qr}
          options={zaLinks}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {showFollowers && me?.id ? (
        <Suspense fallback={<AppLoadingOverlay label="Đang tải danh sách…" />}>
          <FollowersSheet
            userId={me.id}
            followersCount={0}
            initialTab="followers"
            onClose={() => setShowFollowers(false)}
            onSelect={(id) => {
              setShowFollowers(false);
              // Mở đúng hồ sơ người được chọn (app-shell lắng nghe sự kiện này).
              window.dispatchEvent(
                new CustomEvent("app:view-profile", { detail: { userId: id } }),
              );
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}


export default FloatingDock;
