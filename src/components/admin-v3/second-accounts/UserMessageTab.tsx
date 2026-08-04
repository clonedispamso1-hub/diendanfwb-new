// Tab "User" trong Tin nhắn — chọn nhiều user thật + nhiều clone, gửi tin đồng loạt.
// Dữ liệu user lấy từ RPC admin_internal_real_users (chỉ user thật, loại clone/admin).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search, Send, Sticker, Smile, Users, X, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GifPicker } from "@/components/candy/gif-picker";
import { ComposerEmojiPicker } from "@/components/candy/composer-emoji-picker";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { voiceToken, type VoiceLibraryItem } from "@/lib/voice-chat";
import type { AccountLite } from "./InternalTools";
import { CloneFilterBar, EMPTY_CLONE_FILTER, type CloneFilterValue } from "./CloneFilterBar";
import { filterByMeta, useProfileMeta } from "@/lib/admin/profile-meta";
import { isRecentlyActive, offlineLabel } from "@/components/candy/presence-status";

const sb = supabase as any;

export type RealUser = {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  is_online: boolean | null;
  last_seen: string | null;
  created_at: string | null;
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
  if (range === "today") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d.toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86400000).toISOString();
}

export function UserMessageTab({ accounts }: { accounts: AccountLite[] }) {
  const [users, setUsers] = useState<RealUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [pickedUsers, setPickedUsers] = useState<string[]>([]);
  const [pickedClones, setPickedClones] = useState<string[]>([]);
  const [cloneQ, setCloneQ] = useState("");
  const [cloneFilter, setCloneFilter] = useState<CloneFilterValue>(EMPTY_CLONE_FILTER);
  const [text, setText] = useState("");
  const [gif, setGif] = useState<string | null>(null);
  const [showGif, setShowGif] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);
  const [showVoice, setShowVoice] = useState(false);
  const [voice, setVoice] = useState<VoiceLibraryItem | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_real_users", {
        p_search: q.trim() || null,
        p_since: sinceOf(range),
        p_limit: 1000,
      });
      if (error) throw error;
      setUsers((data ?? []) as RealUser[]);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách user");
    } finally {
      setLoading(false);
    }
  }, [q, range]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Khu vực của clone + user thật (batch, cache chung).
  const cloneIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const userIds = useMemo(() => users.map((u) => u.id), [users]);
  const cloneMeta = useProfileMeta(cloneIds);
  const userMeta = useProfileMeta(userIds);

  const clones = useMemo(() => {
    const term = cloneQ.trim().toLowerCase();
    const base = term
      ? accounts.filter(
          (a) =>
            a.username.toLowerCase().includes(term) ||
            (a.full_name || "").toLowerCase().includes(term),
        )
      : accounts;
    return filterByMeta(base, cloneMeta, cloneFilter.gender, cloneFilter.province);
  }, [accounts, cloneQ, cloneMeta, cloneFilter]);

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function send() {
    if (!pickedClones.length) return toast.error("Chọn ít nhất 1 clone");
    if (!pickedUsers.length) return toast.error("Chọn ít nhất 1 user");
    const body = voice
      ? voiceToken(voice.storage_path, voice.duration)
      : gif ? `[[gif:${gif}]]` : text.trim();
    if (!body) return toast.error("Nội dung trống");
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_broadcast_message", {
        p_accounts: pickedClones,
        p_peers: pickedUsers,
        p_content: body,
        p_image_url: null,
      });
      if (error) throw error;
      toast.success(`Đã gửi ${data ?? 0} tin nhắn`);
      setText("");
      setGif(null);
      setVoice(null);
    } catch (e: any) {
      toast.error(e?.message || "Gửi thất bại");
    } finally {
      setBusy(false);
    }
  }

  const totalMsgs = pickedClones.length * pickedUsers.length;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-3">
      {/* Danh sách user thật */}
      <div className="admv3-card p-3">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              className="admv3-input w-64 pl-7"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm user thật…"
            />
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={`admv3-btn ${range === r.key ? "" : "admv3-btn-ghost"}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="admv3-btn admv3-btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Tải lại
          </button>
          <span className="text-xs text-muted-foreground ml-auto">
            {users.length} user • đã chọn {pickedUsers.length}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <button
            className="admv3-btn admv3-btn-ghost"
            onClick={() => setPickedUsers(users.map((u) => u.id))}
          >
            Chọn tất cả
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setPickedUsers([])}>
            Bỏ chọn
          </button>
        </div>

        <div className="border rounded-lg divide-y max-h-[460px] overflow-auto">
          {users.map((u) => {
            // Online nếu đang online HOẶC hoạt động trong 3 ngày gần nhất.
            const on = !!u.is_online || isRecentlyActive(u.last_seen);
            const checked = pickedUsers.includes(u.id);
            return (
              <label
                key={u.id}
                className="px-3 py-2 flex items-center gap-2 hover:bg-muted/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(pickedUsers, u.id, setPickedUsers)}
                />
                <div className="relative">
                  {u.avatar ? (
                    <img
                      src={u.avatar}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-muted grid place-items-center text-xs">
                      {(u.full_name || u.username || "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-background ${
                      on ? "bg-emerald-500" : "bg-muted-foreground/50"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {u.full_name || u.username}
                    {userMeta.get(u.id)?.province ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}• {userMeta.get(u.id)?.province}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                </div>
                <span className={`text-[11px] ${on ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {on ? "Online" : offlineLabel(u.last_seen)}
                </span>
              </label>
            );
          })}
          {!users.length && !loading && (
            <div className="p-4 text-xs text-muted-foreground">Không có user phù hợp.</div>
          )}
        </div>
      </div>

      {/* Clone + soạn tin */}
      <div className="admv3-card p-3 flex flex-col gap-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Users size={14} /> Clone gửi đi ({pickedClones.length})
        </div>
        <input
          className="admv3-input"
          value={cloneQ}
          onChange={(e) => setCloneQ(e.target.value)}
          placeholder="Tìm clone…"
        />
        <CloneFilterBar value={cloneFilter} onChange={setCloneFilter} />
        <div className="flex items-center gap-2">
          <button
            className="admv3-btn admv3-btn-ghost"
            onClick={() => setPickedClones(clones.map((a) => a.id))}
          >
            Chọn tất cả
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setPickedClones([])}>
            Bỏ chọn
          </button>
          <span className="text-[11px] text-muted-foreground ml-auto">{clones.length} clone</span>
        </div>
        <div className="border rounded-lg divide-y max-h-[240px] overflow-auto">
          {clones.map((a) => (
            <label
              key={a.id}
              className="px-2 py-1.5 flex items-center gap-2 hover:bg-muted/40 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={pickedClones.includes(a.id)}
                onChange={() => toggle(pickedClones, a.id, setPickedClones)}
              />
              {a.avatar ? (
                <img
                  src={a.avatar}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-muted grid place-items-center text-[10px]">
                  {a.username?.[0]?.toUpperCase()}
                </div>
              )}
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
          <button
            className="admv3-btn admv3-btn-ghost admv3-btn-icon"
            title="Emoji"
            onClick={() => setShowEmoji((v) => !v)}
          >
            <Smile size={16} />
          </button>
          <button
            ref={gifAnchor}
            className="admv3-btn admv3-btn-ghost admv3-btn-icon"
            title="GIF"
            onClick={() => setShowGif((v) => !v)}
          >
            <Sticker size={16} />
          </button>
          <button
            className="admv3-btn admv3-btn-ghost admv3-btn-icon"
            title="Gửi Voice (chọn từ thư viện)"
            onClick={() => setShowVoice(true)}
          >
            <Mic size={16} />
          </button>
          <ComposerEmojiPicker
            open={showEmoji}
            onClose={() => setShowEmoji(false)}
            onPick={(emoji) => setText((t) => t + emoji)}
          />
          <GifPicker
            open={showGif}
            onClose={() => setShowGif(false)}
            onPick={(u) => {
              setGif(u);
              setShowGif(false);
            }}
            anchorRef={gifAnchor}
          />
          <VoiceLibraryPicker
            open={showVoice}
            title="Gửi Voice"
            onClose={() => setShowVoice(false)}
            onPick={(item) => { setVoice(item); setShowVoice(false); }}
          />
        </div>

        {voice && (
          <div className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-muted w-fit">
            <Mic size={12} /> {voice.title}
            <button onClick={() => setVoice(null)}><X size={12} /></button>
          </div>
        )}


        {gif && (
          <div className="relative w-fit">
            <img loading="lazy" decoding="async" src={gif} alt="" className="max-h-28 rounded-lg border" />
            <button
              className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5"
              onClick={() => setGif(null)}
            >
              <X size={12} />
            </button>
          </div>
        )}

        <textarea
          className="admv3-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nội dung tin nhắn…"
          disabled={!!gif}
        />

        <div className="text-xs text-muted-foreground">
          Sẽ gửi <b>{totalMsgs}</b> tin ({pickedClones.length} clone × {pickedUsers.length} user).
        </div>
        <button className="admv3-btn" onClick={send} disabled={busy || !totalMsgs}>
          <Send size={14} /> {busy ? "Đang gửi…" : "Gửi hàng loạt"}
        </button>
      </div>
    </div>
  );
}
