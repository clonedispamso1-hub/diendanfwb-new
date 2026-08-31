/**
 * BaitGroupCard — "Card Nhóm" nhỏ gọn hiển thị trong bài viết, bình luận và tin nhắn.
 * Gồm: ảnh nhóm · tên nhóm · số thành viên · nút "Vào".
 *
 * Bấm card / nút "Vào":
 *  - Nếu id là PHÒNG CHAT THẬT (bảng `groups`) → deep link `/chat?group=<id>`
 *    và chat-page mở thẳng phòng chat đó (tự thêm vào thành viên nếu chưa có).
 *  - Nếu id là NHÓM MỒI (Supabase #4) → deep link `/chat?bait=<id>` và tab Nhóm
 *    mở đúng nhóm đó ngay (không dừng ở danh sách chung).
 *
 * Markup dùng <span> (display block/flex) để card hợp lệ khi nằm inline trong
 * nội dung text của bình luận / bong bóng tin nhắn.
 */
import { useEffect, useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/components/candy/auth-provider";
import { fetchBaitGroupById } from "@/lib/bait-groups-cache";
import { shortCount, applyLocation, type BaitGroup } from "@/lib/supabase-v4";
import { requestBaitFocus } from "@/lib/bait-group-token";
import { supabase } from "@/lib/db/router";

type CardData = {
  kind: "real" | "bait";
  id: string;
  name: string;
  avatar_url: string | null;
  member_count: number;
};

/** Nhóm chat thật (bảng `groups` ở Supabase #1) — nếu id trỏ tới phòng thật. */
async function loadRealGroup(id: string): Promise<CardData | null> {
  try {
    const { data } = await supabase
      .from("groups" as any)
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const { count } = await supabase
      .from("group_members" as any)
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", id)
      .is("left_at", null);
    return {
      kind: "real",
      id,
      name: (data as any).name || "Nhóm chat",
      avatar_url: null,
      member_count: count || 0,
    };
  } catch {
    return null;
  }
}

export function BaitGroupCard({ groupId }: { groupId: string }) {
  const [card, setCard] = useState<CardData | null>(null);
  const navigate = useNavigate();
  const { me } = useAuth();
  const province = ((me as any)?.province || (me as any)?.location || null) as string | null;

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Ưu tiên phòng chat thật để nút "Vào" nhảy thẳng vào phòng.
      const real = await loadRealGroup(groupId);
      if (real) {
        if (alive) setCard(real);
        return;
      }
      const bait = (await fetchBaitGroupById(groupId).catch(() => null)) as BaitGroup | null;
      if (alive && bait) {
        setCard({
          kind: "bait",
          id: bait.id,
          name: bait.name,
          avatar_url: bait.avatar_url,
          member_count: bait.member_count || 0,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (!card) return null;

  const open = async () => {
    if (card.kind === "real") {
      // Đảm bảo là thành viên rồi vào thẳng phòng chat.
      try {
        if (me?.id) {
          await supabase
            .from("group_members" as any)
            .upsert({ group_id: card.id, user_id: me.id, left_at: null } as any, {
              onConflict: "group_id,user_id",
            });
        }
      } catch {
        /* không chặn điều hướng nếu upsert thất bại */
      }
      navigate(`/chat?group=${card.id}`);
      return;
    }
    requestBaitFocus(card.id);
    navigate(`/chat?bait=${card.id}`);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void open();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          void open();
        }
      }}
      className="mt-2 flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-2.5 transition-colors hover:bg-violet-500/15 cursor-pointer"
    >
      {card.avatar_url ? (
        <img
          src={card.avatar_url}
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

      <span className="min-w-0 flex-1 block">
        <span className="block truncate text-sm font-bold">
          {applyLocation(card.name, province)}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users size={11} />
          {shortCount(card.member_count)} thành viên
        </span>
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void open();
        }}
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-extrabold text-white transition-transform active:scale-95"
      >
        Vào <ArrowRight size={13} />
      </button>
    </span>
  );
}

export default BaitGroupCard;
