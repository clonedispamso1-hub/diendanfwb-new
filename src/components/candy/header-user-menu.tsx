import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  User as UserIcon,
  LogOut,
  ShieldCheck,
  Trophy,
  Pencil,
  Lock,
} from "lucide-react";
import coinIcon from "@/assets/brand/coin.png";
import fansIcon from "@/assets/brand/fans.gif";
import starIcon from "@/assets/brand/shooting-star.gif";

import { formatCandy } from "@/lib/format";
import type { Profile } from "@/lib/app-types";
import { supabase } from "@/lib/supabase";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { EditProfileSheet } from "@/components/candy/edit-profile-sheet";
import { adminPath } from "@/lib/admin-slug";

interface HeaderUserMenuProps {
  me: Profile;
  onProfile: () => void;
  onActivityLog: () => void;
  onBalanceHistory: () => void;
  onTransferGem: () => void;
  onRanking: () => void;
  onSettings: () => void;
  onLogout: () => void;
  /** Bắt buộc: phần tử trigger (avatar + tên) cần controlled by parent. */
  trigger: React.ReactNode;
  /** "full" header+stats+menu. "simple" chỉ menu. "stats" chỉ header+stats. */
  variant?: "full" | "simple" | "stats";
  /** Class thêm cho nút trigger. */
  triggerClassName?: string;
}

interface MenuItemDef {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  danger?: boolean;
}

export function HeaderUserMenu(props: HeaderUserMenuProps) {
  const {
    me,
    onProfile,
    onActivityLog,
    onBalanceHistory,
    onTransferGem,
    onRanking,
    onSettings,
    onLogout,
    trigger,
    variant = "full",
    triggerClassName,
  } = props;

  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [followRank, setFollowRank] = useState<number>(0);
  const [starsRank, setStarsRank] = useState<number>(0);
  const [rankLoading, setRankLoading] = useState(false);

  // Fetch user's best rank across leaderboards when the menu opens.
  useEffect(() => {
    if (!open || !me?.id) return;
    let alive = true;
    setRankLoading(true);
    void (async () => {
      try {
        const [followRes, starsRes] = await Promise.all([
          supabase.rpc("leaderboard_follow", { _period: "today" }),
          supabase.rpc("leaderboard_active_stars_week"),
        ]);
        if (!alive) return;
        const findRank = (rows: any) => {
          if (!Array.isArray(rows)) return 0;
          const i = rows.findIndex((r: any) => (r.user_id || r.author_id) === me.id);
          return i >= 0 ? i + 1 : 0;
        };
        setFollowRank(findRank(followRes?.data));
        setStarsRank(findRank(starsRes?.data));
      } catch {
        if (alive) { setFollowRank(0); setStarsRank(0); }
      } finally {
        if (alive) setRankLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, me?.id]);

  // Tính vị trí dropdown theo trigger.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gutter = 16;
      const menuWidth = Math.min(340, window.innerWidth - gutter * 2);
      const idealRight = window.innerWidth - r.right;
      const maxRight = Math.max(gutter, window.innerWidth - gutter - menuWidth);
      setRect({
        top: r.bottom + 8,
        right: Math.min(Math.max(gutter, idealRight), maxRight),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Đóng khi click ngoài / nhấn Esc / có event candy:close-menus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = document.getElementById("header-user-menu-pop");
      if (menu && menu.contains(target)) return;
      setOpen(false);
    };
    const onCloseMenus = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("candy:close-menus", onCloseMenus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("candy:close-menus", onCloseMenus);
    };
  }, [open]);

  const close = () => setOpen(false);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const isAdmin = (me as any)?.is_admin === true;

  // Popup "Chỉnh sửa trang cá nhân" — dùng lại đúng component đang có.
  const [editOpen, setEditOpen] = useState(false);
  const [editFocus, setEditFocus] = useState<"profile" | "password">("profile");
  const openEdit = (focus: "profile" | "password") => {
    setEditFocus(focus);
    setEditOpen(true);
  };

  const items: MenuItemDef[] = [
    {
      icon: <UserIcon size={16} />,
      label: "Hồ sơ",
      description: "Cập nhật ảnh đại diện, tên hiển thị",
      onClick: run(onProfile),
    },
    {
      icon: <Trophy size={16} />,
      label: "Bảng xếp hạng",
      description: "Xem BXH cộng đồng",
      onClick: run(onRanking),
    },
    {
      icon: <Pencil size={16} />,
      label: "Chỉnh sửa hồ sơ",
      description: "Cập nhật tên hiển thị và tiểu sử",
      onClick: run(() => openEdit("profile")),
    },
    {
      icon: <Lock size={16} />,
      label: "Đổi mật khẩu",
      description: "Đổi mật khẩu đăng nhập",
      onClick: run(() => openEdit("password")),
    },
    ...(isAdmin
      ? [{
          icon: <ShieldCheck size={16} />,
          label: "Quản lý thành viên",
          description: "Trang quản trị hệ thống",
          onClick: run(() => { const p = adminPath("/login") ?? adminPath(); if (p) navigate(p); }),
        }]
      : []),
    {
      icon: <LogOut size={16} />,
      label: "Đăng xuất",
      onClick: run(onLogout),
      danger: true,
    },
  ];
  // Các callback tương thích call-site (không còn dùng trong menu này):
  void onActivityLog; void onBalanceHistory; void onTransferGem; void onSettings;




  const portal =
    typeof window !== "undefined" && open && rect
      ? createPortal(
          <AnimatePresence>
            <motion.div
              id="header-user-menu-pop"
              key="header-menu"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: rect.top,
                right: rect.right,
                zIndex: 100000,
              }}
              className="hum-menu"
              role="menu"
            >
              {variant === "full" || variant === "stats" ? (
                <>
                  <div className="hum-header">
                    <div className="hum-avatar" style={{ background: "transparent", border: "none" }}>
                      <AvatarGlow
                        avatar={me.avatar}
                        
                        size={48}
                        alt={me.full_name || "U"}
                      />
                    </div>
                    <div className="hum-id">
                      <div className="hum-name">{me.full_name || "Người dùng"}</div>
                      {me.public_id ? (
                        <div className="hum-pid-badge">{me.public_id}</div>
                      ) : (
                        <div className="hum-pid">ID: —</div>
                      )}
                    </div>
                  </div>

                  <div className="hum-stats">
                    <div className="hum-stat hum-stat--gem">
                      <div className="hum-stat-body">
                        <span className="hum-stat-label">Số dư:</span>
                        <span className="hum-stat-value hum-stat-value--gem">
                          {formatCandy(me.gem_balance || 0)}
                          <img loading="lazy" decoding="async" src={coinIcon} alt="coin" className="hum-brand-icon hum-brand-icon--coin" />
                        </span>
                      </div>
                    </div>
                    <div className="hum-stat">
                      <img loading="lazy" decoding="async" src={fansIcon} alt="" className="hum-brand-icon hum-brand-icon--fans" />
                      <div className="hum-stat-body">
                        <span className="hum-stat-label">Top Follow:</span>
                        <span className="hum-stat-value">
                          {rankLoading ? "…" : `#${followRank}`}
                        </span>
                      </div>
                    </div>
                    <div className="hum-stat">
                      <img loading="lazy" decoding="async" src={starIcon} alt="" className="hum-brand-icon hum-brand-icon--star" />
                      <div className="hum-stat-body">
                        <span className="hum-stat-label">Top Ngôi Sao đang lên:</span>
                        <span className="hum-stat-value">
                          {rankLoading ? "…" : `#${starsRank}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {variant === "full" ? (
                    <ul className="hum-list" style={{ marginTop: 12 }}>
                      {items.map((it) => (
                        <li key={it.label}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={it.onClick}
                            className={`hum-item${it.danger ? " is-danger" : ""}`}
                          >
                            <span className="hum-item-icon">{it.icon}</span>
                            <span className="hum-item-text">
                              <span className="hum-item-label">{it.label}</span>
                              {it.description ? (
                                <span className="hum-item-desc">{it.description}</span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <ul className="hum-list">
                  {items.map((it) => (
                    <li key={it.label}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={it.onClick}
                        className={`hum-item${it.danger ? " is-danger" : ""}`}
                      >
                        <span className="hum-item-icon">{it.icon}</span>
                        <span className="hum-item-text">
                          <span className="hum-item-label">{it.label}</span>
                          {it.description ? (
                            <span className="hum-item-desc">{it.description}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-inventory-target="1"
        className={triggerClassName ?? "hum-trigger"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {portal}
      {me ? (
        <EditProfileSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={me as any}
          onSaved={() => { /* AuthProvider tự refresh */ }}
          focusSection={editFocus}
        />
      ) : null}
    </>

  );
}
