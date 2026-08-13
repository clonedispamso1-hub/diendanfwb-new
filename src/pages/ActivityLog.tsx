import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  UserPlus,
  Activity as ActivityIcon,
  FileText,
  User as UserIcon,
  MapPin,
  Sparkles,
  PenSquare,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { supabase } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/time-format";
import { useRealtime, pickNew } from "@/lib/realtime-registry";

type ActivityRow = {
  id: string;
  user_id: string;
  action_type: string;
  target_id: string | null;
  metadata: Record<string, any> | null;
  description: string | null;
  created_at: string;
};

// Audit log thành viên — KHÔNG bao gồm biến động Gem (xem Lịch sử số dư Gem).
const ALLOWED_TYPES = [
  "post_create",
  "post_like",
  "comment",
  "follow",
  "name_change",
  "location_change",
  "story_create",
  "status_update",
] as const;

const ACTION_META: Record<string, { label: string; icon: any; tone: string }> = {
  post_create:     { label: "Đăng bài viết",        icon: FileText,      tone: "text-emerald-500" },
  post_like:       { label: "Đã thích bài viết",    icon: Heart,         tone: "text-rose-500" },
  comment:         { label: "Đã bình luận",         icon: MessageCircle, tone: "text-sky-500" },
  follow:          { label: "Bắt đầu yêu thích",     icon: UserPlus,      tone: "text-indigo-500" },
  name_change:     { label: "Đổi tên hiển thị",     icon: UserIcon,      tone: "text-amber-500" },
  location_change: { label: "Cập nhật khu vực",     icon: MapPin,        tone: "text-teal-500" },
  story_create:    { label: "Thêm tin (story) mới", icon: Sparkles,      tone: "text-fuchsia-500" },
  status_update:   { label: "Cập nhật trạng thái",  icon: PenSquare,     tone: "text-violet-500" },
};

function rowMeta(t: string) {
  return ACTION_META[t] ?? { label: t, icon: ActivityIcon, tone: "text-zinc-500" };
}

function describe(row: ActivityRow, peerName: string | null): string {
  // Ưu tiên description đã ghi sẵn từ helper logActivity().
  if (row.description && row.description.trim()) return row.description.trim();
  const meta: any = row.metadata ?? {};
  if (typeof meta.description === "string" && meta.description.trim()) return meta.description.trim();
  const m = row.metadata ?? {};
  const who = peerName || m.target_name || "ai đó";
  switch (row.action_type) {
    case "post_create": return m.preview ? `“${String(m.preview).slice(0, 80)}”` : "Bạn đã đăng một bài viết mới.";
    case "follow":    return `Bạn đã yêu thích ${who}.`;
    case "comment":   return m.preview ? `“${String(m.preview).slice(0, 80)}”` : `Bạn đã bình luận vào bài viết của ${who}.`;
    case "post_like": return `Bạn đã thích bài viết của ${who}.`;
    case "name_change":     return m.to ? `Bạn đã thay đổi tên hiển thị thành “${m.to}”.` : "Bạn đã thay đổi tên hiển thị.";
    case "location_change": return m.to ? `Bạn đã cập nhật khu vực sinh sống thành “${m.to}”.` : "Bạn đã cập nhật khu vực sinh sống.";
    case "story_create":    return "Bạn đã thêm một story mới.";
    case "status_update":   return m.preview ? `Bạn đã cập nhật trạng thái: “${String(m.preview).slice(0, 80)}”.` : "Bạn đã cập nhật trạng thái mới.";
    default:          return "";
  }
}

function Inner() {
  const { me, ready } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [peers, setPeers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!me?.id) { navigate("/", { replace: true }); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("activity_logs")
        .select("id, user_id, action_type, target_id, metadata, description, created_at")
        .eq("user_id", me.id)
        .in("action_type", ALLOWED_TYPES as any)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!alive) return;
      const list = (data as ActivityRow[]) ?? [];
      setRows(list);

      // Lookup peer names for follow rows
      const ids = Array.from(new Set(
        list
          .filter((r) => r.action_type === "follow")
          .map((r) => r.target_id)
          .filter((x): x is string => !!x)
      ));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, full_name, username, public_id").in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          map[p.id] = p.full_name || (p.public_id ? `ID ${p.public_id}` : p.id.slice(0, 6));
        });
        if (alive) setPeers(map);
      }
      if (alive) setLoading(false);
    })();

    return () => { alive = false; };
  }, [me?.id, ready, navigate]);

  // Realtime dùng channel dùng chung (registry), filter server-side theo user.
  useRealtime(
    me?.id ? `activity-${me.id}` : null,
    me?.id ? [{ table: "activity_logs", event: "INSERT", filter: `user_id=eq.${me.id}` }] : [],
    (payload) => {
      const row = pickNew(payload) as unknown as ActivityRow | undefined;
      if (!row) return;
      if (!(ALLOWED_TYPES as readonly string[]).includes(row.action_type)) return;
      setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev].slice(0, 200)));
    },
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Quay lại"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold leading-none">Lịch sử hoạt động</h1>
      </header>

      <div className="mx-auto w-full max-w-screen-sm px-4 py-4 pb-24">
        <p className="mb-3 text-xs text-muted-foreground">
          Chỉ hiển thị tương tác xã hội (thích, bình luận, yêu thích).
          Mọi biến động Gem xem tại <span className="font-medium text-foreground">Lịch sử số dư Gem</span>.
        </p>
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Đang tải…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
            Chưa có hoạt động nào được ghi nhận.
          </div>
        ) : (
          <ol className="relative ml-3 border-l border-border/60">
            {rows.map((r) => {
              const meta = rowMeta(r.action_type);
              const Icon = meta.icon;
              const peerName = r.target_id ? peers[r.target_id] || null : null;
              const text = describe(r, peerName);
              return (
                <li key={r.id} className="relative pl-6 pb-5">
                  <span
                    className={`absolute -left-[11px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background ${meta.tone}`}
                  >
                    <Icon size={12} />
                  </span>
                  <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-sm font-medium leading-snug break-words">{meta.label}</p>
                      <time className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(r.created_at)}
                      </time>
                    </div>
                    {text ? (
                      <p className="mt-1 text-xs text-muted-foreground break-words">{text}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}

export default function ActivityLogPage() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Inner />
      </NotificationProvider>
    </AuthProvider>
  );
}
