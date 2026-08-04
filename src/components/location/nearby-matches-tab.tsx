// PHASE 3.4 — Tab "❤️ Đã kết nối"
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listNearbyMatches, type NearbyMatchRow } from "@/lib/nearby-interest-store";

const sb = supabase as unknown as any;

interface MatchProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  age: number | null;
  city: string | null;
  province: string | null;
}

interface Row extends NearbyMatchRow { profile?: MatchProfile | null; }

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export function NearbyMatchesTab() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const matches = await listNearbyMatches();
      if (cancelled) return;
      if (matches.length === 0) { setRows([]); setLoading(false); return; }
      const ids = matches.map((m) => m.other_id);
      const { data } = await sb
        .from("profiles")
        .select("id, full_name, username, avatar, age, city, province")
        .in("id", ids);
      const map = new Map<string, MatchProfile>();
      (data || []).forEach((p: MatchProfile) => map.set(p.id, p));
      const merged = matches.map((m) => ({ ...m, profile: map.get(m.other_id) ?? null }));
      if (!cancelled) { setRows(merged); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid h-[40vh] place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải kết nối…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-rose-500/15 text-rose-500">
          <Heart className="h-8 w-8" />
        </div>
        <h3 className="text-base font-semibold">Chưa có kết nối nào</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Hãy ❤️ Quan tâm những người bạn thấy thú vị. Khi cả hai cùng quan tâm,
          các bạn sẽ kết nối ngay tại đây.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-3 py-3">
      {rows.map((r) => {
        const p = r.profile;
        const name = p?.full_name || "Người dùng";
        const city = p?.city || p?.province || "Việt Nam";
        return (
          <li
            key={r.other_id}
            className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm hover:shadow"
          >
            <button
              type="button"
              onClick={() => navigate(`/profile/${r.other_id}`)}
              className="flex-shrink-0"
            >
              <img loading="lazy" decoding="async"
                src={p?.avatar || "/placeholder.svg"}
                alt={name}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-rose-500/30"
              />
            </button>
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/chat/${r.other_id}`)}>
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{name}</span>
                {typeof p?.age === "number" ? <span className="text-xs text-muted-foreground">· {p.age}</span> : null}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /><span className="truncate">{city}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-rose-500">❤️ Đã kết nối · {fmtAgo(r.matched_at)}</div>
            </div>
            <Button
              size="sm"
              className="h-8 gap-1 rounded-full bg-rose-500 px-3 text-xs text-white hover:bg-rose-600"
              onClick={() => navigate(`/chat/${r.other_id}`)}
            >
              <MessageCircle className="h-3.5 w-3.5" /> Nhắn
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default NearbyMatchesTab;
