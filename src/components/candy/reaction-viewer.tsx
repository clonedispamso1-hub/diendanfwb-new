import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import type { AggregatedReaction } from "@/lib/message-reactions";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";
import { resolveUserName } from "@/lib/user-name";

interface ReactorProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  public_id: string | null;
  avatar: string | null;
}

interface Props {
  messageId: string;
  buckets: AggregatedReaction[];
  onClose: () => void;
}

/** Bottom-sheet danh sách người đã reaction theo từng emoji. */
export function ReactionViewer({ messageId, buckets, onClose }: Props) {
  const totals = useMemo(
    () => buckets.reduce((sum, b) => sum + b.count, 0),
    [buckets],
  );
  const [tab, setTab] = useState<string>("all");
  const [profiles, setProfiles] = useState<Record<string, ReactorProfile>>({});

  const allUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of buckets) for (const u of b.userIds) s.add(u);
    return Array.from(s);
  }, [buckets]);

  useEffect(() => {
    if (allUserIds.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, public_id, avatar")
        .in("id", allUserIds);
      const map: Record<string, ReactorProfile> = {};
      for (const p of (data as ReactorProfile[]) || []) map[p.id] = p;
      setProfiles(map);
    })();
  }, [allUserIds.join(",")]);

  const visibleUsers = useMemo(() => {
    if (tab === "all") {
      const seen = new Set<string>();
      const out: { userId: string; emoji: string }[] = [];
      for (const b of buckets) {
        for (const u of b.userIds) {
          if (seen.has(u)) continue;
          seen.add(u);
          out.push({ userId: u, emoji: b.emoji });
        }
      }
      return out;
    }
    const b = buckets.find((x) => x.emoji === tab);
    return b ? b.userIds.map((u) => ({ userId: u, emoji: tab })) : [];
  }, [tab, buckets]);

  return (
    <div className="tg-sheet-backdrop" onClick={onClose}>
      <div
        className="tg-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, margin: "auto", padding: 0 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          <strong style={{ fontSize: 15 }}>Cảm xúc</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Đóng"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 12px",
            overflowX: "auto",
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          <button
            type="button"
            onClick={() => setTab("all")}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid hsl(var(--border))",
              background: tab === "all" ? "hsl(var(--primary))" : "transparent",
              color: tab === "all" ? "hsl(var(--primary-foreground))" : "inherit",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Tất cả {totals}
          </button>
          {buckets.map((b) => (
            <button
              key={b.emoji}
              type="button"
              onClick={() => setTab(b.emoji)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid hsl(var(--border))",
                background: tab === b.emoji ? "hsl(var(--primary))" : "transparent",
                color: tab === b.emoji ? "hsl(var(--primary-foreground))" : "inherit",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span>{b.emoji}</span>
              <span>{b.count}</span>
            </button>
          ))}
        </div>

        <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 4px" }}>
          {visibleUsers.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
              Chưa có ai thả cảm xúc.
            </div>
          ) : (
            visibleUsers.map((u) => {
              const p = profiles[u.userId];
              const name = resolveUserName(p as any, "Người dùng");
              return (
                <div
                  key={u.userId + u.emoji}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                  }}
                >
                  <img loading="lazy" decoding="async"
                    src={getValidAvatarUrl(p?.avatar)}
                    onError={handleAvatarError}
                    alt={name}
                    style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                      <CloneVipNameMedia userId={u.userId} />
                    </div>
                    {p?.public_id ? (
                      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>UID {p.public_id}</div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 20 }}>{u.emoji}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
      <button className="tg-sheet-cancel" onClick={onClose}>Đóng</button>
    </div>
  );
}

export default ReactionViewer;
