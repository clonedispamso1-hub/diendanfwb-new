import { useAdminMarks } from "@/lib/admin/chat-admin-marks";

/** Nhãn "Đã dùng Kịch bản …" cạnh tên người dùng (chỉ Admin Panel). */
export function ScriptUsageBadges({ peerId }: { peerId: string }) {
  const { usage, loaded, error } = useAdminMarks();
  if (!loaded) return <div className="text-[10px] text-muted-foreground mt-1">Đang tải kịch bản đã dùng…</div>;
  if (error) return <div className="text-[10px] text-destructive mt-1" title={error}>Không tải được kịch bản đã dùng</div>;
  const list = usage.filter((u) => u.peer_id === peerId)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!list.length) return null;
  return (
    <div className="admin-script-history flex flex-wrap gap-1 mt-1" aria-label="Lịch sử sử dụng kịch bản">
      {list.map((u) => (
        <span key={`${u.script_id}-${u.account_id}`}
          title={new Date(u.at).toLocaleString("vi-VN")}
          className="text-[10px] px-1.5 py-0.5 rounded-full border bg-muted text-foreground">
          Đã dùng {u.script_name}{u.account_username ? ` · @${u.account_username}` : ""}
        </span>
      ))}
    </div>
  );
}
