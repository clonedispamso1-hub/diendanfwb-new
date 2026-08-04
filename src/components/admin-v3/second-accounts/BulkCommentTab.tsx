// Bình luận hàng loạt (thủ công) cho tài khoản clone.
// Liệt kê bài viết của USER THẬT (admin_internal_real_posts), chọn bài + clone +
// GIF/text và gửi ngay (admin_internal_comment_many).
// Auto Comment (scheduler / autopilot / cron) đã được gỡ bỏ hoàn toàn.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw, Search, Send, Sticker, X, Eye, Mic, Clock, Timer, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GifPicker } from "@/components/candy/gif-picker";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { voiceToken, type VoiceLibraryItem } from "@/lib/voice-chat";
import type { AccountLite } from "./InternalTools";
import { PostViewerModal } from "./PostViewerModal";
import { CloneFilterBar, EMPTY_CLONE_FILTER, type CloneFilterValue } from "./CloneFilterBar";
import { filterByMeta, useProfileMeta } from "@/lib/admin/profile-meta";

const sb = supabase as any;

export type RealPost = {
  id: string;
  content: string | null;
  created_at: string | null;
  author_id: string;
  author_username: string | null;
  author_name: string | null;
  author_avatar: string | null;
  comments_count: number;
};

type Range = "today" | "7d" | "30d" | "all";
const RANGES: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Hôm nay" },
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "all", label: "Tất cả" },
];
function sinceOf(range: Range): string | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "today")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  return new Date(now.getTime() - (range === "7d" ? 7 : 30) * 86400000).toISOString();
}

/* ---------------- Delay Queue ---------------- */

type DelayUnit = "s" | "m" | "h";
const UNIT_MS: Record<DelayUnit, number> = { s: 1000, m: 60_000, h: 3_600_000 };
const UNIT_LABEL: Record<DelayUnit, string> = { s: "Giây", m: "Phút", h: "Giờ" };

const PRESETS: Array<{ label: string; value: number; unit: DelayUnit }> = [
  { label: "10 giây", value: 10, unit: "s" },
  { label: "30 giây", value: 30, unit: "s" },
  { label: "1 phút", value: 1, unit: "m" },
  { label: "5 phút", value: 5, unit: "m" },
  { label: "15 phút", value: 15, unit: "m" },
  { label: "1 giờ", value: 1, unit: "h" },
];

type QueueItem = {
  id: string;
  postId: string;
  accountId: string;
  content: string;
  runAt: number;
  status: "pending" | "sending" | "done" | "error";
  error?: string;
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "sắp gửi…";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h) return `${h}g ${m}p`;
  if (m) return `${m}p ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function BulkCommentTab({ accounts }: { accounts: AccountLite[] }) {
  const [posts, setPosts] = useState<RealPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [pickedPosts, setPickedPosts] = useState<string[]>([]);
  const [pickedClones, setPickedClones] = useState<string[]>([]);
  const [cloneQ, setCloneQ] = useState("");
  const [cloneFilter, setCloneFilter] = useState<CloneFilterValue>(EMPTY_CLONE_FILTER);
  const [gifs, setGifs] = useState<string[]>([]);
  const [showGif, setShowGif] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [voices, setVoices] = useState<VoiceLibraryItem[]>([]);
  const [texts, setTexts] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<RealPost | null>(null);
  const [includeClones, setIncludeClones] = useState(true);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);

  // --- Delay queue state ---
  const [sendMode, setSendMode] = useState<"now" | "delay">("now");
  const [delayKind, setDelayKind] = useState<"fixed" | "random">("fixed");
  const [unit, setUnit] = useState<DelayUnit>("s");
  const [fixedVal, setFixedVal] = useState("30");
  const [randMin, setRandMin] = useState("1");
  const [randMax, setRandMax] = useState("3");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const runningRef = useRef(false);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = { p_search: q.trim() || null, p_since: sinceOf(range), p_limit: 300 };
      // RPC mới hỗ trợ bài của Clone; DB chưa cập nhật thì fallback bản cũ.
      let { data, error } = await sb.rpc("admin_internal_real_posts", {
        ...base,
        p_include_clones: includeClones,
      });
      if (error) {
        const res = await sb.rpc("admin_internal_real_posts", base);
        data = res.data; error = res.error;
      }
      if (error) throw error;
      setPosts((data ?? []) as RealPost[]);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được bài viết");
    } finally {
      setLoading(false);
    }
  }, [q, range, includeClones]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const cloneIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const cloneMeta = useProfileMeta(cloneIds);

  const clones = useMemo(() => {
    const term = cloneQ.trim().toLowerCase();
    const base = !term
      ? accounts
      : accounts.filter(
          (a) =>
            a.username.toLowerCase().includes(term) ||
            (a.full_name || "").toLowerCase().includes(term),
        );
    return filterByMeta(base, cloneMeta, cloneFilter.gender, cloneFilter.province);
  }, [accounts, cloneQ, cloneMeta, cloneFilter]);

  const contents = useMemo(() => {
    const t = texts.split("\n").map((s) => s.trim()).filter(Boolean);
    return [
      ...gifs.map((u) => `[[gif:${u}]]`),
      ...voices.map((v) => voiceToken(v.storage_path, v.duration)),
      ...t,
    ];
  }, [gifs, voices, texts]);

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function validate() {
    if (!pickedPosts.length) { toast.error("Chưa chọn bài viết"); return false; }
    if (!pickedClones.length) { toast.error("Chưa chọn clone"); return false; }
    if (!contents.length) { toast.error("Chọn GIF hoặc nhập nội dung"); return false; }
    return true;
  }

  // Đồng hồ 1s để cập nhật countdown + kích hoạt job tới hạn.
  useEffect(() => {
    if (!queue.some((j) => j.status === "pending" || j.status === "sending")) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [queue]);

  // Bộ chạy hàng chờ: gửi tuần tự các job đã tới hạn.
  useEffect(() => {
    if (runningRef.current) return;
    const due = queue.filter((j) => j.status === "pending" && j.runAt <= Date.now());
    if (!due.length) return;
    runningRef.current = true;
    (async () => {
      for (const job of due) {
        setQueue((qs) => qs.map((x) => (x.id === job.id ? { ...x, status: "sending" } : x)));
        try {
          const { error } = await sb.rpc("admin_internal_comment_many", {
            p_posts: [job.postId], p_accounts: [job.accountId], p_contents: [job.content],
          });
          if (error) throw error;
          setQueue((qs) => qs.map((x) => (x.id === job.id ? { ...x, status: "done" } : x)));
        } catch (e: any) {
          setQueue((qs) => qs.map((x) => (
            x.id === job.id ? { ...x, status: "error", error: e?.message || "Lỗi" } : x
          )));
        }
      }
      runningRef.current = false;
      setNow(Date.now());
      load();
    })();
  }, [queue, now, load]);

  /** Sinh khoảng trễ (ms) cho job kế tiếp. */
  function nextDelayMs(): number {
    const mult = UNIT_MS[unit];
    if (delayKind === "random") {
      const lo = Math.max(0, Number(randMin) || 0);
      const hi = Math.max(lo, Number(randMax) || lo);
      return Math.round((lo + Math.random() * (hi - lo)) * mult);
    }
    return Math.max(0, Number(fixedVal) || 0) * mult;
  }

  function scheduleDelayed() {
    if (!validate()) return;
    const jobs: QueueItem[] = [];
    let cursor = Date.now();
    let i = 0;
    for (const postId of pickedPosts) {
      for (const accountId of pickedClones) {
        cursor += nextDelayMs();
        jobs.push({
          id: `${postId}:${accountId}:${cursor}:${i}`,
          postId,
          accountId,
          content: contents[i % contents.length],
          runAt: cursor,
          status: "pending",
        });
        i += 1;
      }
    }
    setQueue((qs) => [...qs, ...jobs]);
    setNow(Date.now());
    toast.success(`Đã xếp ${jobs.length} bình luận vào hàng chờ`);
  }

  const pendingCount = queue.filter((j) => j.status === "pending" || j.status === "sending").length;

  async function sendNow() {
    if (!validate()) return;
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_comment_many", {
        p_posts: pickedPosts, p_accounts: pickedClones, p_contents: contents,
      });
      if (error) throw error;
      toast.success(`Đã gửi ${data ?? 0} bình luận`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Bình luận thất bại");
    } finally { setBusy(false); }
  }

  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-3">
      {/* Bài viết user thật */}
      <div className="admv3-card p-3">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
            <input className="admv3-input w-64 pl-7" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm bài viết / tác giả…" />
          </div>
          {RANGES.map((r) => (
            <button key={r.key} className={`admv3-btn ${range === r.key ? "" : "admv3-btn-ghost"}`}
              onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
          <button
            className={`admv3-btn ${includeClones ? "" : "admv3-btn-ghost"}`}
            title="Hiển thị cả bài viết của tài khoản Clone để Clone bình luận qua lại"
            onClick={() => setIncludeClones((v) => !v)}
          >
            🤖 Bài của Clone
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Tải lại
          </button>
          <span className="text-xs text-muted-foreground ml-auto">
            {posts.length} bài • đã chọn {pickedPosts.length}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setPickedPosts(posts.map((p) => p.id))}>
            Chọn tất cả
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setPickedPosts([])}>Bỏ chọn</button>
        </div>

        <div className="border rounded-lg divide-y max-h-[520px] overflow-auto">
          {posts.map((p) => (
            <div key={p.id} className="px-3 py-2 flex items-start gap-2 hover:bg-muted/40">
              <input type="checkbox" className="mt-1" checked={pickedPosts.includes(p.id)}
                onChange={() => toggle(pickedPosts, p.id, setPickedPosts)} />
              {p.author_avatar
                ? <img loading="lazy" decoding="async" src={p.author_avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <div className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs">
                    {(p.author_name || p.author_username || "?")[0]?.toUpperCase()}
                  </div>}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {p.author_name || p.author_username} • @{p.author_username} •{" "}
                  {p.created_at ? new Date(p.created_at).toLocaleString("vi-VN") : "—"} •{" "}
                  {p.comments_count} bình luận
                </div>
                <div className="text-sm line-clamp-2 whitespace-pre-wrap break-words">
                  {(p.content || "").replace(/\[\[gif:[^\]]+\]\]/g, "[GIF]") || "(không có nội dung)"}
                </div>
              </div>
              <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Xem bài"
                onClick={() => setViewing(p)}><Eye size={14} /></button>
            </div>
          ))}
          {!posts.length && !loading && (
            <div className="p-4 text-xs text-muted-foreground">Không có bài viết phù hợp.</div>
          )}
        </div>
      </div>

      {/* Clone + nội dung + lịch */}
      <div className="admv3-card p-3 flex flex-col gap-2">
        <div className="text-sm font-semibold">Clone bình luận ({pickedClones.length})</div>
        <input className="admv3-input" value={cloneQ} onChange={(e) => setCloneQ(e.target.value)}
          placeholder="Tìm clone…" />
        <CloneFilterBar value={cloneFilter} onChange={setCloneFilter} />
        <div className="flex items-center gap-2">
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setPickedClones(clones.map((a) => a.id))}>
            Chọn tất cả
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setPickedClones([])}>Bỏ chọn</button>
        </div>
        <div className="border rounded-lg divide-y max-h-[200px] overflow-auto">
          {clones.map((a) => (
            <label key={a.id} className="px-2 py-1.5 flex items-center gap-2 hover:bg-muted/40 cursor-pointer">
              <input type="checkbox" checked={pickedClones.includes(a.id)}
                onChange={() => toggle(pickedClones, a.id, setPickedClones)} />
              {a.avatar
                ? <img src={a.avatar} alt="" loading="lazy" decoding="async" className="w-7 h-7 rounded-full object-cover" />
                : <div className="w-7 h-7 rounded-full bg-muted grid place-items-center text-[10px]">
                    {a.username?.[0]?.toUpperCase()}
                  </div>}
              <span className="text-xs truncate">{a.full_name || a.username}</span>
              {cloneMeta.get(a.id)?.province ? (
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {cloneMeta.get(a.id)?.province}
                </span>
              ) : null}
            </label>
          ))}
          {!clones.length && (
            <div className="p-3 text-xs text-muted-foreground">Không có clone phù hợp bộ lọc.</div>
          )}
        </div>


        <div className="relative flex items-center gap-1">
          <button ref={gifAnchor} className="admv3-btn admv3-btn-ghost" onClick={() => setShowGif((v) => !v)}>
            <Sticker size={14} /> Chọn GIF
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setShowVoice(true)}>
            <Mic size={14} /> Voice Bình Luận
          </button>
          <GifPicker open={showGif} onClose={() => setShowGif(false)} anchorRef={gifAnchor}
            onPick={(u) => { setGifs((g) => (g.includes(u) ? g : [...g, u])); setShowGif(false); }} />
          <VoiceLibraryPicker
            open={showVoice}
            title="Voice Bình Luận"
            onClose={() => setShowVoice(false)}
            onPick={(item) => {
              setVoices((v) => (v.some((x) => x.id === item.id) ? v : [...v, item]));
              setShowVoice(false);
            }}
          />
        </div>
        {!!voices.length && (
          <div className="flex gap-2 flex-wrap">
            {voices.map((v) => (
              <span key={v.id} className="text-[11px] px-2 py-1 rounded-full bg-muted flex items-center gap-1">
                <Mic size={11} /> {v.title}
                <button onClick={() => setVoices((list) => list.filter((x) => x.id !== v.id))}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}

        {!!gifs.length && (
          <div className="flex gap-2 flex-wrap">
            {gifs.map((u) => (
              <div key={u} className="relative">
                <img loading="lazy" decoding="async" src={u} alt="" className="w-16 h-16 rounded object-cover border" />
                <button className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5"
                  onClick={() => setGifs((g) => g.filter((x) => x !== u))}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <textarea className="admv3-input" rows={3} value={texts} onChange={(e) => setTexts(e.target.value)}
          placeholder="Nội dung text (mỗi dòng 1 mẫu, dùng xoay vòng)…" />
        <div className="text-xs text-muted-foreground">
          {contents.length} mẫu • sẽ tạo {pickedPosts.length * pickedClones.length} bình luận
        </div>

        {/* --- Chế độ gửi --- */}
        <div className="border rounded-lg p-2 flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <button
              className={`admv3-btn ${sendMode === "now" ? "" : "admv3-btn-ghost"}`}
              onClick={() => setSendMode("now")}
            ><Send size={14} /> Gửi ngay</button>
            <button
              className={`admv3-btn ${sendMode === "delay" ? "" : "admv3-btn-ghost"}`}
              onClick={() => setSendMode("delay")}
            ><Clock size={14} /> Theo độ trễ</button>
          </div>

          {sendMode === "delay" && (
            <>
              <div className="flex items-center gap-1">
                <button
                  className={`admv3-btn ${delayKind === "fixed" ? "" : "admv3-btn-ghost"}`}
                  onClick={() => setDelayKind("fixed")}
                >Cố định</button>
                <button
                  className={`admv3-btn ${delayKind === "random" ? "" : "admv3-btn-ghost"}`}
                  onClick={() => setDelayKind("random")}
                  title="Mỗi bình luận cách nhau một khoảng ngẫu nhiên cho giống người thật"
                >Ngẫu nhiên</button>
                <select
                  className="admv3-input w-24 ml-auto"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as DelayUnit)}
                >
                  {(["s", "m", "h"] as DelayUnit[]).map((u) => (
                    <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                  ))}
                </select>
              </div>

              {delayKind === "fixed" ? (
                <>
                  <div className="flex gap-1 flex-wrap">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        className={`admv3-btn admv3-btn-ghost text-xs ${
                          unit === p.unit && String(p.value) === fixedVal ? "!bg-muted" : ""
                        }`}
                        onClick={() => { setUnit(p.unit); setFixedVal(String(p.value)); }}
                      >{p.label}</button>
                    ))}
                  </div>
                  <label className="text-xs text-muted-foreground flex items-center gap-2">
                    Mỗi bình luận cách nhau
                    <input
                      className="admv3-input w-24" type="number" min={0}
                      value={fixedVal} onChange={(e) => setFixedVal(e.target.value)}
                    />
                    {UNIT_LABEL[unit].toLowerCase()}
                  </label>
                </>
              ) : (
                <label className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  Ngẫu nhiên từ
                  <input
                    className="admv3-input w-20" type="number" min={0}
                    value={randMin} onChange={(e) => setRandMin(e.target.value)}
                  />
                  đến
                  <input
                    className="admv3-input w-20" type="number" min={0}
                    value={randMax} onChange={(e) => setRandMax(e.target.value)}
                  />
                  {UNIT_LABEL[unit].toLowerCase()}
                </label>
              )}
            </>
          )}
        </div>

        {sendMode === "now" ? (
          <button className="admv3-btn" onClick={sendNow} disabled={busy}>
            <Send size={14} /> Bình luận ngay
          </button>
        ) : (
          <button className="admv3-btn" onClick={scheduleDelayed} disabled={busy}>
            <Timer size={14} /> Xếp hàng chờ gửi
          </button>
        )}

        {!!queue.length && (
          <div className="border rounded-lg">
            <div className="flex items-center gap-2 px-2 py-1.5 border-b text-xs">
              <Timer size={13} />
              <span className="font-medium">Hàng chờ</span>
              <span className="text-muted-foreground">
                {pendingCount} đang chờ / {queue.length}
              </span>
              <button
                className="admv3-btn admv3-btn-ghost ml-auto text-xs"
                onClick={() => setQueue((qs) => qs.filter((j) => j.status === "sending"))}
              ><Trash2 size={12} /> Xoá hàng chờ</button>
            </div>
            <div className="max-h-[200px] overflow-auto divide-y">
              {queue.map((j) => {
                const acc = accounts.find((a) => a.id === j.accountId);
                return (
                  <div key={j.id} className="px-2 py-1 text-[11px] flex items-center gap-2">
                    <span className="truncate flex-1">
                      {acc?.full_name || acc?.username || j.accountId.slice(0, 6)} →{" "}
                      {j.content.replace(/\[\[gif:[^\]]+\]\]/g, "[GIF]").slice(0, 40)}
                    </span>
                    {j.status === "pending" && (
                      <span className="text-muted-foreground shrink-0">
                        {fmtCountdown(j.runAt - now)}
                      </span>
                    )}
                    {j.status === "sending" && <span className="text-blue-600 shrink-0">Đang gửi…</span>}
                    {j.status === "done" && <span className="text-emerald-600 shrink-0">✓ Đã gửi</span>}
                    {j.status === "error" && (
                      <span className="text-red-600 shrink-0" title={j.error}>Lỗi</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {viewing && (
        <PostViewerModal
          postId={viewing.id}
          title={`Bài của ${viewing.author_name || viewing.author_username}`}
          content={viewing.content}
          accounts={accounts}
          defaultAccountId={pickedClones[0] ?? null}
          onClose={() => setViewing(null)}
        />
      )}

    </div>
  );
}
