/**
 * BaitGroupCard — card nhóm mồi nhỏ gọn hiển thị dưới caption bài viết.
 * Gồm: ảnh nhóm · tên nhóm · số thành viên · nút "Vào".
 * Bấm card hoặc nút "Vào" → sang trang Tin nhắn, tab Nhóm, focus nhóm đó.
 */
import { useEffect, useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/components/candy/auth-provider";
import { fetchBaitGroupById } from "@/lib/bait-groups-cache";
import { shortCount, applyLocation, type BaitGroup } from "@/lib/supabase-v4";
import { focusBaitGroup } from "@/lib/bait-group-token";

export function BaitGroupCard({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<BaitGroup | null>(null);
  const navigate = useNavigate();
  const { me } = useAuth();
  const province = ((me as any)?.province || (me as any)?.location || null) as string | null;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await fetchBaitGroupById(groupId).catch(() => null);
      if (alive) setGroup(data);
    })();
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (!group) return null;

  const open = () => {
    focusBaitGroup(group.id);
    navigate("/chat");
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") open();
      }}
      className="mt-2 flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-2.5 transition-colors hover:bg-violet-500/15 cursor-pointer"
    >
      {group.avatar_url ? (
        <img
          src={group.avatar_url}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)" }}
          aria-hidden
        >
          <Users size={20} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{applyLocation(group.name, province)}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users size={11} />
          {shortCount(group.member_count || 0)} thành viên
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-extrabold text-white transition-transform active:scale-95"
      >
        Vào <ArrowRight size={13} />
      </button>
    </div>
  );
}

export default BaitGroupCard;
