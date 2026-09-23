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
import { GroupCard } from "@/components/candy/group-card";
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
    <GroupCard
      inline
      dataGroupId={card.id}
      name={applyLocation(card.name, province)}
      avatarUrl={card.avatar_url}
      memberCount={shortCount(card.member_count)}
      previewText="Tin nhắn mới trong nhóm…"
      onOpen={() => void open()}
    />
  );
}

export default BaitGroupCard;
