import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, UserCog, LifeBuoy, Facebook, Users, X } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { useUnreadNotifications } from "@/components/candy/notifications-panel";
import { EditProfileSheet } from "@/components/candy/edit-profile-sheet";
// Chức năng "Chặn" đã được gỡ hoàn toàn — không còn BlockedListSheet.
import { Portal } from "@/components/candy/portal";
import { supabase } from "@/lib/supabase";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
const AVATAR_FALLBACK = "https://i.pinimg.com/1200x/5d/7f/d8/5d7fd8238fa5dbaa52d1663398a59d60.jpg";
const ADMIN_LINK_KEYS = ["group_zalo", "group_facebook", "fb_admin", "zalo_admin"] as const;

const STORAGE_KEY = "avatar_float_pos_v1";
const SIZE = 52;

interface Pos { x: number; y: number }

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 16, y: 240 };
  return {
    x: Math.max(8, window.innerWidth - SIZE - 16),
    y: Math.max(8, window.innerHeight - SIZE - 140),
  };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return defaultPos();
}

function useUnreadMessages(meId?: string | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!meId) { setCount(0); return; }
    let cancelled = false;
    const refresh = async () => {
      const { count: c } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", meId)
        .eq("is_read", false);
      if (!cancelled) setCount(c || 0);
    };
    void refresh();
    const ch = supabase
      .channel(`fab-msg-${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${meId}` }, () => void refresh())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(ch); };
  }, [meId]);
  return count;
}

export function AvatarFloatingButton() {
  const { me, logout } = useAuth();
  // useNavigate removed — admin links open externally in new tab.
  const { count: unread } = useUnreadNotifications();
  const unreadMsg = useUnreadMessages(me?.id);
  const [pos, setPos] = useState<Pos>(() => defaultPos());
  const [open, setOpen] = useState(false);
  // showBlocked state removed — chức năng Chặn đã gỡ.
  const [showEdit, setShowEdit] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [adminLinks, setAdminLinks] = useState<Record<string, string>>({});
  const dragRef = useRef<{ down: boolean; moved: boolean; offX: number; offY: number }>({
    down: false, moved: false, offX: 0, offY: 0,
  });

  useEffect(() => { setPos(loadPos()); }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase.from("admin_settings") as any)
          .select("key,value")
          .in("key", ADMIN_LINK_KEYS as any);
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as Array<{ key: string; value: string }>) {
          if (row?.key && row?.value) map[row.key] = row.value;
        }
        setAdminLinks(map);
      } catch { /* ignore — table may not exist yet */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    const handler = () => {
      setPos((p) => ({
        x: Math.min(p.x, window.innerWidth - SIZE - 4),
        y: Math.min(p.y, window.innerHeight - SIZE - 4),
      }));
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Cho phép các menu khác (HeaderUserMenu, ProfileMenuSheet…) mở nhanh
  // Edit / Groups / Support qua CustomEvent — tránh khoan prop xuyên nhiều tầng.
  useEffect(() => {
    const openEdit = () => setShowEdit(true);
    const openGroups = () => setShowGroups(true);
    const openSupport = () => setShowSupport(true);
    window.addEventListener("app:open-edit-profile", openEdit);
    window.addEventListener("app:open-groups", openGroups);
    window.addEventListener("app:open-support", openSupport);
    return () => {
      window.removeEventListener("app:open-edit-profile", openEdit);
      window.removeEventListener("app:open-groups", openGroups);
      window.removeEventListener("app:open-support", openSupport);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = {
      down: true, moved: false,
      offX: e.clientX - pos.x, offY: e.clientY - pos.y,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.down) return;
    const targetX = e.clientX - dragRef.current.offX;
    const targetY = e.clientY - dragRef.current.offY;
    if (Math.abs(targetX - pos.x) > 3 || Math.abs(targetY - pos.y) > 3) dragRef.current.moved = true;
    const nx = Math.max(4, Math.min(window.innerWidth - SIZE - 4, targetX));
    const ny = Math.max(4, Math.min(window.innerHeight - SIZE - 4, targetY));
    requestAnimationFrame(() => setPos({ x: nx, y: ny }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.down) return;
    dragRef.current.down = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!dragRef.current.moved) {
      setOpen((v) => !v);
    } else {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
    }
  };

  const avatar = (me as any)?.avatar || AVATAR_FALLBACK;
  const displayName = me?.full_name || "Khách";

  const totalBadge = (unread || 0) + (unreadMsg || 0);


  const popupRight = pos.x > (typeof window !== "undefined" ? window.innerWidth : 0) / 2;
  const popupBelow = pos.y < 220;
  const popupStyle: React.CSSProperties = typeof window === "undefined" ? {} : {
    position: "fixed",
    [popupRight ? "right" : "left"]: popupRight ? Math.max(8, window.innerWidth - pos.x - SIZE) : Math.max(8, pos.x),
    [popupBelow ? "top" : "bottom"]: popupBelow ? pos.y + SIZE + 10 : Math.max(8, window.innerHeight - pos.y + 10),
    zIndex: 9999,
    width: 196,
  };

  const handleLogout = async () => { setOpen(false); await logout(); };

  return (
    <>
      <motion.button
        aria-label="Mở menu nhanh"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        style={{
          position: "fixed",
          left: pos.x, top: pos.y, zIndex: 9998,
          width: SIZE, height: SIZE, borderRadius: 999, padding: 0,
          border: "2px solid hsl(var(--accent))",
          background: "hsl(var(--card))",
          boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
          cursor: "grab", touchAction: "none", userSelect: "none", overflow: "visible",
        }}
      >
        <img loading="lazy" decoding="async"
          src={avatarSrc(avatar, 64)} alt={displayName} draggable={false}
          style={{
            width: "100%", height: "100%",
            borderRadius: 999, objectFit: "cover", display: "block",
            pointerEvents: "none",
          }}
        />
        {totalBadge > 0 ? (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999,
            background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))",
            fontSize: 11, fontWeight: 800,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "2px solid hsl(var(--card))", lineHeight: 1,
          }}>
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        ) : null}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop trong suốt: chỉ để bắt click-outside, KHÔNG làm tối nội dung */}
            <motion.div
              key="fab-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent" }}
            />
            <motion.div
              key="fab-popup"
              role="dialog" aria-label="Menu nhanh"
              initial={{ opacity: 0, scale: 0.85, y: popupBelow ? -8 : 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: popupBelow ? -8 : 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              style={{
                ...popupStyle,
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 18,
                boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                padding: 8,
                transformOrigin: popupBelow
                  ? `${popupRight ? "right" : "left"} top`
                  : `${popupRight ? "right" : "left"} bottom`,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <FabBtn
                  icon={<Users size={14} />}
                  label="Nhóm Zalo, Facebook"
                  onClick={() => { setOpen(false); setShowGroups(true); }}
                />
                <FabBtn
                  icon={<LifeBuoy size={14} />}
                  label="Hỗ trợ"
                  onClick={() => { setOpen(false); setShowSupport(true); }}
                />
                {/* "Đã chặn" đã được gỡ hoàn toàn theo yêu cầu launch. */}
                <FabBtn
                  icon={<UserCog size={14} />}
                  label="Đổi thông tin"
                  onClick={() => { setOpen(false); setShowEdit(true); }}
                  disabled={!me}
                />
                <FabBtn
                  icon={<LogOut size={14} />}
                  label={me ? "Đăng xuất" : "Chưa đăng nhập"}
                  onClick={handleLogout}
                  disabled={!me}
                  danger
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Popup Thông báo do app-shell render — không mount thêm ở đây để
          tránh trùng lặp realtime subscriptions và full-screen layout. */}

      {/* Danh sách "Đã chặn" đã được gỡ hoàn toàn. */}

      {me ? (
        <EditProfileSheet
          open={showEdit}
          onClose={() => setShowEdit(false)}
          profile={me as any}
          onSaved={() => { /* AuthProvider sẽ refresh me qua realtime */ }}
        />
      ) : null}

      <LinkChoiceModal
        open={showGroups}
        onClose={() => setShowGroups(false)}
        title="Tham gia cộng đồng"
        subtitle="Chọn nền tảng bạn muốn tham gia"
        zaloUrl={adminLinks.group_zalo}
        facebookUrl={adminLinks.group_facebook}
        zaloLabel="Nhóm Zalo"
        facebookLabel="Nhóm Facebook"
      />
      <LinkChoiceModal
        open={showSupport}
        onClose={() => setShowSupport(false)}
        title="Liên hệ hỗ trợ"
        subtitle="Liên hệ admin qua nền tảng bạn dùng"
        zaloUrl={adminLinks.zalo_admin}
        facebookUrl={adminLinks.fb_admin}
        zaloLabel="Zalo Admin"
        facebookLabel="Facebook Admin"
      />
    </>
  );
}

function LinkChoiceModal({
  open, onClose, title, subtitle, zaloUrl, facebookUrl, zaloLabel, facebookLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  zaloUrl?: string;
  facebookUrl?: string;
  zaloLabel: string;
  facebookLabel: string;
}) {
  const openLink = (url?: string, fallback?: string) => {
    if (!url) { alert(`Link "${fallback}" chưa được admin cấu hình.`); return; }
    openExternalLinkWithFeedback(url);
    onClose();
  };
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="lcm-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 10020,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              display: "grid", placeItems: "center", padding: 16,
            }}
          >
            <motion.div
              key="lcm-panel"
              role="dialog" aria-modal="true"
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 380,
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 22,
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                padding: 20,
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                style={{
                  position: "absolute", top: 12, right: 12,
                  width: 32, height: 32, borderRadius: 999,
                  background: "hsl(var(--muted))", border: "none",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, paddingRight: 32 }}>{title}</h3>
              <p style={{ margin: "4px 0 18px", fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{subtitle}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => openLink(zaloUrl, zaloLabel)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 8, padding: "18px 12px", borderRadius: 16,
                    background: "linear-gradient(135deg, #0068FF, #1E90FF)",
                    color: "#fff", border: "none", cursor: "pointer",
                    boxShadow: "0 8px 24px rgba(0,104,255,0.35)",
                    fontWeight: 700,
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: "rgba(255,255,255,0.18)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900, letterSpacing: 0.5,
                  }}>Zalo</div>
                  <span style={{ fontSize: 13 }}>{zaloLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openLink(facebookUrl, facebookLabel)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 8, padding: "18px 12px", borderRadius: 16,
                    background: "linear-gradient(135deg, #1877F2, #3B5998)",
                    color: "#fff", border: "none", cursor: "pointer",
                    boxShadow: "0 8px 24px rgba(24,119,242,0.35)",
                    fontWeight: 700,
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: "rgba(255,255,255,0.18)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Facebook size={24} />
                  </div>
                  <span style={{ fontSize: 13 }}>{facebookLabel}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function FabBtn({
  icon, label, onClick, badge, disabled, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      whileHover={disabled ? undefined : { x: 2 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 9px", borderRadius: 12,
        border: "1px solid transparent",
        background: "transparent",
        color: danger ? "hsl(var(--destructive))" : "hsl(var(--foreground))",
        fontSize: 12.5, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "left", position: "relative",
      }}
    >
      <span style={{
        display: "inline-flex", width: 22, height: 22, borderRadius: 8,
        background: danger ? "hsl(var(--destructive) / 0.12)" : "hsl(var(--muted) / 0.7)",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && badge > 0 ? (
        <span style={{
          minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999,
          background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))",
          fontSize: 11, fontWeight: 800,
          display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          boxShadow: "0 2px 6px hsl(var(--destructive) / 0.4)",
        }}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </motion.button>
  );
}
