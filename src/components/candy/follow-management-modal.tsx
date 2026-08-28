import { deriveUid } from "@/lib/user-uid";
import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

import { followUser, unfollowUser, announceFollowChange } from "@/lib/follow-actions";
import UniversalBadge from "@/components/candy/universal-badge";

import { read3 } from "@/lib/content-db";
import { resolveUserName } from "@/lib/user-name";
type Mode = "following" | "followers";

interface UserRow {
  id: string;
  full_name: string | null;
  username: string | null;
  public_id: string | null;
  avatar: string | null;
  vip_level: number | null;
  // following === true means current user follows this user
  isFollowing: boolean;
  busy?: boolean;
}

interface Props {
  open: boolean;
  mode: Mode;
  meId: string;
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
}

/**
 * Modal hiển thị danh sách "Đã yêu thích" / "Người yêu thích" kèm
 * nút Follow / Unfollow trực tiếp trên từng dòng.
 */
export function FollowManagementModal({ open, mode, meId, onClose, onOpenProfile }: Props) {
  useBodyScrollLock(open);
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    if (!open || !meId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Lấy list user-id liên quan
        const col = mode === "following" ? "following_id" : "follower_id";
        const filterCol = mode === "following" ? "follower_id" : "following_id";
        const { data: rows } = await read3()
          .from("follows")
          .select(`${col}`)
          .eq(filterCol, meId)
          // Egress: chỉ nạp 50 người gần nhất thay vì 1000 (payload /20).
          .range(0, 49);
        const ids = (rows || []).map((r: any) => r[col]).filter(Boolean);
        if (ids.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username, public_id, avatar, vip_level")
          .in("id", ids);

        // Đối với mode "followers": cần biết mình có follow lại họ không
        let myFollowingSet = new Set<string>();
        if (mode === "followers") {
          const { data: mine } = await read3()
            .from("follows")
            .select("following_id")
            .eq("follower_id", meId)
            .in("following_id", ids);
          myFollowingSet = new Set((mine || []).map((r: any) => r.following_id));
        }

        const mapped: UserRow[] = (profiles || []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name,
          username: p.username,
          public_id: p.public_id,
          avatar: p.avatar,
          vip_level: p.vip_level,
          isFollowing: mode === "following" ? true : myFollowingSet.has(p.id),
        }));
        if (!cancelled) setItems(mapped);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, meId]);

  const toggleFollow = async (row: UserRow) => {
    if (row.busy) return;
    const target = !row.isFollowing;
    setItems((prev) => prev.map((x) => x.id === row.id ? { ...x, busy: true } : x));
    try {
      if (row.isFollowing) await unfollowUser(meId, row.id);
      else await followUser(meId, row.id);
    } catch { /* swallow — trạng thái cuối lấy từ DB bên dưới */ }
    // NGUỒN SỰ THẬT = DB. Nếu insert bị chặn (rate-limit / RLS) thì UI không
    // được hiển thị sai "Đang theo dõi" rồi quay lại khi mở popup lần sau.
    let final = target;
    try {
      const { data } = await read3()
        .from("follows")
        .select("follower_id")
        .eq("follower_id", meId)
        .eq("following_id", row.id)
        .maybeSingle();
      final = Boolean(data);
    } catch { /* giữ trạng thái lạc quan */ }
    announceFollowChange(row.id, final);
    setItems((prev) => prev.map((x) =>
      x.id === row.id ? { ...x, busy: false, isFollowing: final } : x
    ));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{ zIndex: 10001 }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            style={{
              width: "min(440px, 92vw)",
              maxHeight: "80vh",
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 18,
              boxShadow: "0 30px 70px rgba(0,0,0,0.35)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: "1px solid hsl(var(--border))",
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {mode === "following" ? "Đã yêu thích" : "Người yêu thích"}
                <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>
                  ({items.length})
                </span>
              </h3>
              <button
                aria-label="Đóng"
                onClick={onClose}
                style={{
                  width: 30, height: 30, borderRadius: 999,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                  color: "hsl(var(--foreground))",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div
              data-scroll-lock-ignore
              style={{
                overflowY: "auto",
                padding: 10,
                flex: 1,
                WebkitOverflowScrolling: "touch" as any,
                overscrollBehavior: "contain",
                touchAction: "pan-y",
              }}
            >

              {loading ? (
                <p style={{ padding: 16, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>Đang tải…</p>
              ) : items.length === 0 ? (
                <p style={{ padding: 28, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
                  {mode === "following" ? "Bạn chưa yêu thích ai." : "Chưa có người yêu thích."}
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                  {items.map((u) => (
                    <li key={u.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}>
                      <button
                        onClick={() => onOpenProfile?.(u.id)}
                        style={{ background: "none", border: 0, padding: 0, cursor: onOpenProfile ? "pointer" : "default", flexShrink: 0 }}
                      >
                        <img loading="lazy" decoding="async"
                          src={avatarSrc(u.avatar || "/placeholder.svg", 64)}
                          alt={resolveUserName(u as any, "User")}
                          style={{ width: 42, height: 42, borderRadius: 999, objectFit: "cover" }}
                        />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, fontSize: 14,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                          {resolveUserName(u as any, "Người dùng")}
                          <UniversalBadge profile={u as any} />
                        </div>
                        {/* CHỈ hiện UID ngắn, không lộ UUID tài khoản. */}
                        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                          UID {u.public_id || deriveUid(u.id)}
                        </div>

                      </div>
                      <button
                        onClick={() => void toggleFollow(u)}
                        disabled={u.busy}
                        style={{
                          padding: "6px 12px", borderRadius: 999,
                          fontSize: 12, fontWeight: 700,
                          border: "1px solid hsl(var(--border))",
                          cursor: u.busy ? "wait" : "pointer",
                          background: u.isFollowing ? "hsl(var(--background))" : "hsl(var(--primary))",
                          color: u.isFollowing ? "hsl(var(--foreground))" : "hsl(var(--primary-foreground))",
                          display: "inline-flex", alignItems: "center", gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        <Heart size={13} fill={u.isFollowing ? "currentColor" : "none"} />
                        {u.isFollowing ? "Bỏ yêu thích" : "Yêu thích lại"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
