// Popup xem "Nhóm mồi của [username]" — dùng lại dữ liệu nhóm sẵn có
// (bait_groups "Nhóm Mới" + zalo_bait_groups "Nhóm Zalo Mồi").
import { useEffect, useState } from "react";
import { X, Users } from "lucide-react";
import { shortCount } from "@/lib/supabase-v4";
import { fetchSeedGroupsOfAccount, type SeedGroupOption } from "@/lib/seed-account-groups";

export function SeedGroupsModal({
  accountId,
  username,
  onClose,
}: {
  accountId: string;
  username: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<SeedGroupOption[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSeedGroupsOfAccount(accountId)
      .then((g) => { if (alive) setGroups(g); })
      .catch((e: any) => { if (alive) setErr(e?.message || "Không tải được nhóm mồi"); });
    return () => { alive = false; };
  }, [accountId]);

  return (
    <div className="fixed inset-0 z-[75] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl border shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">Nhóm mồi của {username}</div>
          <button onClick={onClose} className="admv3-btn admv3-btn-ghost admv3-btn-icon"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto space-y-2">
          {err && <div className="text-sm text-red-500">{err}</div>}
          {!err && groups === null && (
            <div className="text-sm text-muted-foreground">Đang tải…</div>
          )}
          {!err && groups && !groups.length && (
            <div className="text-sm text-muted-foreground">Tài khoản này chưa được gán nhóm mồi nào.</div>
          )}
          {(groups || []).map((g) => (
            <div key={`${g.kind}:${g.id}`} className="flex items-start gap-3 rounded-lg border p-2.5">
              {g.avatar_url ? (
                <img
                  src={g.avatar_url}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="h-11 w-11 rounded-lg bg-muted grid place-items-center shrink-0">
                  <Users size={16} className="text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{g.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {g.source} • {shortCount(g.member_count)} thành viên • {shortCount(g.message_count)} tin nhắn
                </div>
                {g.info && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-3">{g.info}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t text-right">
          <button className="admv3-btn admv3-btn-ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
