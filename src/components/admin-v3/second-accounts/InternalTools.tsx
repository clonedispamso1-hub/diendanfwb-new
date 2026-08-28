import { avatarSrc } from "@/lib/image-cdn";
// Công cụ vận hành cho "Tài khoản thứ hai": Tin nhắn (Messenger Tool) /
// Đăng bài / Bình luận hàng loạt.
// Mọi thao tác đi qua RPC SECURITY DEFINER trong:
//   docs/sql/2026-08-02_SECOND_ACCOUNTS_FINAL.sql
// Tài khoản thứ hai LÀ user thật (auth.users + profiles) nên mọi FK hợp lệ.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Send, RefreshCw, CheckCheck, Crown, Image as ImageIcon, MessageSquare, X, Smile, Gift, Sticker, Loader2, Video, Link2, Mic,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  broadcastCloneMessagesSb3,
  createClonePostSb3,
  insertCloneCommentsSb3,
} from "@/lib/admin/second-account-sb3";
import { GifPicker } from "@/components/candy/gif-picker";
import { VipGifPicker } from "@/components/admin-v3/vip/VipGifPicker";
import { ACCEPT_TOKEN, ACCEPT_PREVIEW_TEXT } from "@/lib/message-requests";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { voiceToken, type VoiceLibraryItem } from "@/lib/voice-chat";
import { ComposerEmojiPicker } from "@/components/candy/composer-emoji-picker";
import { uploadClonePostMediaUrl, uploadMediaUrl } from "@/lib/media";
import { UserMessageTab } from "./UserMessageTab";
import { CloneFilterBar, EMPTY_CLONE_FILTER, type CloneFilterValue } from "./CloneFilterBar";
import { filterByMeta, useProfileMeta } from "@/lib/admin/profile-meta";
import { adminInboxByAccount, adminSendMessage, adminThreadMessages, adminThreads } from "@/lib/admin/chat-admin-rpc";
import { markAllInternalMessagesRead, markAllInternalConversationsSeen } from "@/lib/admin/internal-cleanup";
import { useRealtime } from "@/lib/realtime-registry";

function SubTabs({ sub, setSub }: { sub: "clone" | "user"; setSub: (v: "clone" | "user") => void }) {
  return (
    <div className="flex items-center gap-1 mb-3">
      <button className={`admv3-btn ${sub === "clone" ? "" : "admv3-btn-ghost"}`} onClick={() => setSub("clone")}>
        Clone
      </button>
      <button className={`admv3-btn ${sub === "user" ? "" : "admv3-btn-ghost"}`} onClick={() => setSub("user")}>
        User
      </button>
    </div>
  );
}


const sb = supabase as any;

export type AccountLite = {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  unread?: number;
};

function AccountPicker({
  accounts, value, onChange, label = "Tài khoản",
}: { accounts: AccountLite[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <select className="admv3-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- Chọn tài khoản --</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {(a.full_name || a.username)} (@{a.username}){a.unread ? ` • ${a.unread} chưa đọc` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------- Messages ------------------------------- */
type Thread = {
  peer_id: string; peer_username: string | null; peer_name: string | null;
  peer_avatar: string | null; last_content: string | null; last_at: string | null; unread: number;
};
type Msg = { id: string; sender_id: string; receiver_id: string; content: string | null; created_at: string | null };

/** Thời gian tương đối kiểu Messenger: "Vừa xong", "3 phút trước", "Hôm qua 21:14". */
export function relTime(input: string | number | Date | null | undefined): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diffMs = now.getTime() - d.getTime();
  if (d.toDateString() === now.toDateString()) {
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "Vừa xong";
    if (mins < 60) return `${mins} phút trước`;
    return `${Math.floor(mins / 60)} giờ trước`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Hôm qua ${hm}`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 7) return `${days} ngày trước`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${hm}`;
}

const GIF_TOKEN = /\[\[gif:([^\]\s]+)\]\]/;
const HONGBAO_TOKEN = /^\[\[HONGBAO:[0-9a-fA-F-]{36}\]\]$/;

/**
 * Messenger Tool — bên trái là TOÀN BỘ tài khoản thứ hai (có badge đỏ),
 * bấm vào một tài khoản sẽ mở popup chat dùng đúng thành phần chat của website.
 */
export function MessagesTab({ accounts }: { accounts: AccountLite[] }) {
  const [sub, setSub] = useState<"clone" | "user">("clone");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [lastAt, setLastAt] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<AccountLite | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CloneFilterValue>(EMPTY_CLONE_FILTER);
  const [markingSeen, setMarkingSeen] = useState(false);


  const loadUnread = useCallback(async () => {
    setLoading(true);
    try {
      // RPC mới: kèm thời điểm tin nhắn mới nhất (để đưa người vừa nhắn lên đầu).
      // Inbox clone nằm ở Supabase #3 (module chat đã cutover).
      const rows: any[] = await adminInboxByAccount(accounts.map((a) => a.id));
      const map: Record<string, number> = {};
      const times: Record<string, number> = {};
      (rows ?? []).forEach((r: any) => {
        map[r.account_id] = Number(r.unread ?? 0);
        const t = r.last_at ? new Date(r.last_at).getTime() : 0;
        times[r.account_id] = Number.isFinite(t) ? t : 0;
      });
      setUnread(map);
      setLastAt(times);
    } catch (e: any) { toast.error(e?.message || "Không tải được số tin chưa đọc"); }
    finally { setLoading(false); }
  }, []);

  const clearAllUnread = useCallback(async () => {
    try {
      await markAllInternalMessagesRead();
      setUnread({});
      // Xác minh lại từ DB: nếu badge vẫn còn nghĩa là RPC/RLS chưa cho phép ghi.
      const check = await adminInboxByAccount(accounts.map((a) => a.id)).catch(() => []);
      const still = check.reduce((sum, r) => sum + Number(r.unread ?? 0), 0);
      if (still > 0) {
        toast.error("Badge chưa xoá được (thiếu quyền DB). Hãy chạy file SQL RUN_NOW_2026-08-04_admin_inbox_and_notif_cleanup.sql.");
      } else {
        toast.success("Đã xoá tất cả thông báo tin nhắn (nội dung chat giữ nguyên)");
      }
      loadUnread();
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được thông báo, vui lòng thử lại.");
    }
  }, [loadUnread]);

  /**
   * Đánh dấu ĐÃ XEM hàng loạt: cập nhật last_read = now() cho toàn bộ hội thoại
   * của các tài khoản thứ hai (Clone) → thành viên thấy ✓✓ Đã xem.
   * Một lần ghi duy nhất, không polling.
   */
  const markAllSeen = useCallback(async () => {
    setMarkingSeen(true);
    try {
      await markAllInternalConversationsSeen();
      setUnread({});
      toast.success("Đã đánh dấu đã xem toàn bộ hội thoại của tài khoản thứ hai");
      loadUnread();
    } catch (e: any) {
      toast.error(e?.message || "Không đánh dấu đã xem được, vui lòng thử lại.");
    } finally {
      setMarkingSeen(false);
    }
  }, [loadUnread]);

  useEffect(() => { loadUnread(); }, [loadUnread]);

  // Realtime: có tin nhắn mới → cập nhật badge đỏ.
  useRealtime(
    "admin-internal-messages",
    [{ table: "messages", event: "INSERT" }],
    useCallback(() => loadUnread(), [loadUnread]),
  );

  const cloneIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const cloneMeta = useProfileMeta(cloneIds);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const arr = accounts.map((a) => ({ ...a, unread: unread[a.id] ?? 0 }));
    const filtered = term
      ? arr.filter((a) => (a.full_name || "").toLowerCase().includes(term)
        || a.username.toLowerCase().includes(term) || a.id.toLowerCase().includes(term))
      : arr;
    const byMeta = filterByMeta(filtered, cloneMeta, filter.gender, filter.province);
    // Ai vừa nhắn mới nhất lên đầu; sau đó tới nhóm còn tin chưa đọc.
    return byMeta.slice().sort((a, b) => {
      const d = (lastAt[b.id] ?? 0) - (lastAt[a.id] ?? 0);
      if (d !== 0) return d;
      return (b.unread ?? 0) - (a.unread ?? 0);
    });
  }, [accounts, unread, lastAt, q, cloneMeta, filter]);

  if (sub === "user") {

    return (
      <div>
        <SubTabs sub={sub} setSub={setSub} />
        <UserMessageTab accounts={accounts} />
      </div>
    );
  }

  return (
    <div className="admv3-card p-3">
      <SubTabs sub={sub} setSub={setSub} />
      <div className="flex items-center gap-2 mb-3 flex-wrap">

        <input
          className="admv3-input w-64"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lọc tài khoản…"
        />
        <CloneFilterBar value={filter} onChange={setFilter} />
        <button className="admv3-btn admv3-btn-ghost" onClick={loadUnread} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Tải lại
        </button>
        <button className="admv3-btn admv3-btn-ghost" onClick={clearAllUnread} title="Chỉ xoá thông báo, không xoá nội dung chat">
          <X size={14} /> Xóa tất cả thông báo
        </button>
        <button
          className="admv3-btn"
          onClick={markAllSeen}
          disabled={markingSeen}
          title="Cập nhật last_read = now() cho toàn bộ hội thoại của Clone — thành viên sẽ thấy ✓✓ Đã xem"
        >
          {markingSeen ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />} Đánh dấu đã xem hàng loạt
        </button>
        <span className="text-xs text-muted-foreground ml-auto">{list.length} tài khoản</span>
      </div>

      <div className="border rounded-lg divide-y max-h-[560px] overflow-auto">
        {list.map((a) => (
          <button
            key={a.id}
            onClick={() => setOpen(a)}
            className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center gap-2"
          >
            {a.avatar
              ? <img src={avatarSrc(a.avatar, 64)} alt="" loading="lazy" decoding="async" className="w-9 h-9 rounded-full object-cover" />
              : <div className="w-9 h-9 rounded-full bg-muted grid place-items-center text-xs">{a.username?.[0]?.toUpperCase()}</div>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {a.full_name || a.username}
                {cloneMeta.get(a.id)?.province ? (
                  <span className="text-muted-foreground font-normal"> • {cloneMeta.get(a.id)?.province}</span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                @{a.username} <span className="text-emerald-500">• 🟢 Online</span>
              </div>
            </div>
            {!!a.unread && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{a.unread}</span>
            )}
            <MessageSquare size={14} className="opacity-50" />
          </button>
        ))}
        {!list.length && <div className="p-4 text-xs text-muted-foreground">Không có clone phù hợp bộ lọc.</div>}
      </div>

      {open && (
        <ChatPopup
          account={open}
          onClose={() => { setOpen(null); loadUnread(); }}
        />
      )}
    </div>
  );
}

/** Popup chat — giao diện chat của website, thao tác với tư cách tài khoản thứ hai. */
function ChatPopup({ account, onClose }: { account: AccountLite; onClose: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [peer, setPeer] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showVipGif, setShowVipGif] = useState(false);
  const vipGifAnchor = useRef<HTMLButtonElement | null>(null);
  const [showLixi, setShowLixi] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      // Hội thoại đọc từ Supabase #3, tên/avatar khách ghép từ #1.
      setThreads((await adminThreads(account.id)) as Thread[]);
    } catch (e: any) { toast.error(e?.message || "Không tải được hội thoại"); }
    finally { setLoading(false); }
  }, [account.id]);

  const loadMsgs = useCallback(async (peerId: string) => {
    try {
      setMsgs((await adminThreadMessages(account.id, peerId, 200)) as Msg[]);
      setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 30);
    } catch (e: any) { toast.error(e?.message || "Không tải được tin nhắn"); }
  }, [account.id]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Khu vực của khách trong hội thoại (batch + cache).
  const peerIds = useMemo(() => threads.map((t) => t.peer_id), [threads]);
  const peerMeta = useProfileMeta(peerIds);
  const peerProvince = peer ? (peerMeta.get(peer.peer_id)?.province ?? null) : null;

  // Realtime cho hội thoại đang mở.
  useRealtime(
    `admin-internal-chat-${account.id}`,
    useMemo(() => [{ table: "messages" as const, event: "INSERT" as const }], [account.id]),
    useCallback(() => {
      loadThreads();
      if (peer) loadMsgs(peer.peer_id);
    }, [peer, loadThreads, loadMsgs]),
  );

  async function sendRaw(content: string, imageUrl?: string | null) {
    if (!peer) return;
    try {
      await adminSendMessage(account.id, peer.peer_id, content, imageUrl ?? null);
      await loadMsgs(peer.peer_id);
      loadThreads();
    } catch (e: any) { toast.error(e?.message || "Gửi thất bại"); throw e; }
  }

  async function send() {
    const body = text.trim();
    if (!peer || !body) return;
    setText("");
    try { await sendRaw(body); } catch { setText(body); }
  }

  async function sendGif(url: string) {
    setShowGif(false);
    await sendRaw(`[[gif:${url}]]`).catch(() => {});
  }

  async function pickImage(file: File) {
    setUploading(true);
    try {
      const url = await uploadMediaUrl(file, { kind: "chat" });
      await sendRaw("", url);
    } catch (e: any) { toast.error(e?.message || "Upload thất bại"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl border shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2 min-w-0">
            {account.avatar
              ? <img loading="lazy" decoding="async" src={avatarSrc(account.avatar, 64)} alt="" className="w-8 h-8 rounded-full object-cover" />
              : <div className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs">{account.username?.[0]?.toUpperCase()}</div>}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{account.full_name || account.username}</div>
              <div className="text-[11px] text-muted-foreground truncate">Đang chat với tư cách @{account.username}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="admv3-btn admv3-btn-ghost" onClick={loadThreads} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 grid md:grid-cols-[240px_1fr] min-h-0">
          <div className="border-r overflow-auto">
            {threads.map((t) => (
              <button
                key={t.peer_id}
                onClick={() => { setPeer(t); loadMsgs(t.peer_id); }}
                className={`w-full text-left px-3 py-2 border-b hover:bg-muted/40 ${peer?.peer_id === t.peer_id ? "bg-muted/60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {t.peer_avatar
                    ? <img src={avatarSrc(t.peer_avatar, 64)} alt="" loading="lazy" decoding="async" className="w-7 h-7 rounded-full object-cover" />
                    : <div className="w-7 h-7 rounded-full bg-muted grid place-items-center text-xs">{(t.peer_name || t.peer_username || "?")[0]}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {t.peer_name || t.peer_username || "Người dùng"}
                      {peerMeta.get(t.peer_id)?.province ? (
                        <span className="text-muted-foreground font-normal"> • {peerMeta.get(t.peer_id)?.province}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{previewOf(t.last_content)}</div>
                    {t.last_at && (
                      <div className="text-[10px] text-muted-foreground">{relTime(t.last_at)}</div>
                    )}
                  </div>
                  {t.unread > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{t.unread}</span>
                  )}
                </div>
              </button>
            ))}
            {!threads.length && <div className="p-4 text-xs text-muted-foreground">Chưa có hội thoại.</div>}
          </div>

          <div className="flex flex-col min-h-0">
            {!peer ? (
              <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
                <div className="text-center"><MessageSquare className="mx-auto mb-2 opacity-50" /> Chọn một hội thoại</div>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b">
                  <div className="text-sm font-medium">{peer.peer_name || peer.peer_username}</div>
                  {peerProvince && (
                    <div className="text-xs text-muted-foreground">📍 {peerProvince}</div>
                  )}
                </div>
                <div className="flex-1 overflow-auto p-3 space-y-2">
                  {msgs.map((m) => (
                    <Bubble
                      key={m.id}
                      msg={m}
                      mine={m.sender_id === account.id}
                      accountId={account.id}
                      onChanged={() => peer && loadMsgs(peer.peer_id)}
                    />
                  ))}

                  {!msgs.length && <div className="text-xs text-muted-foreground">Chưa có tin nhắn.</div>}
                  <div ref={endRef} />
                </div>

                <div className="p-2 border-t">
                  <div className="flex items-center gap-1 mb-1 relative">
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Emoji"
                      onClick={() => setShowEmoji((v) => !v)}><Smile size={16} /></button>
                    <button ref={gifAnchor} className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="GIF / Sticker"
                      onClick={() => setShowGif((v) => !v)}><Sticker size={16} /></button>
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Gửi ảnh"
                      onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    </button>
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Lì xì"
                      onClick={() => setShowLixi(true)}><Gift size={16} /></button>
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Gửi Voice"
                      onClick={() => setShowVoice(true)}><Mic size={16} /></button>
                    <input ref={fileRef} type="file" accept="image/*,video/*" hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f); }} />
                    <ComposerEmojiPicker
                      open={showEmoji}
                      onClose={() => setShowEmoji(false)}
                      onPick={(emoji) => setText((t) => t + emoji)}
                    />
                    <GifPicker
                      open={showGif}
                      onClose={() => setShowGif(false)}
                      onPick={sendGif}
                      anchorRef={gifAnchor}
                    />
                    <button ref={vipGifAnchor} className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="VIP GIF (Quản Lý Icon VIP)"
                      onClick={() => setShowVipGif((v) => !v)}><Crown size={16} /></button>
                    <VipGifPicker open={showVipGif} onClose={() => setShowVipGif(false)} anchorRef={vipGifAnchor}
                      onPick={(u) => { setShowVipGif(false); sendGif(u); }} />
                    <VoiceLibraryPicker
                      open={showVoice}
                      title="Gửi Voice"
                      onClose={() => setShowVoice(false)}
                      onPick={(item) => {
                        setShowVoice(false);
                        void sendRaw(voiceToken(item.storage_path, item.duration)).catch(() => {});
                      }}
                    />

                  </div>
                  <div className="flex gap-2">
                    <input
                      className="admv3-input flex-1"
                      value={text}
                      placeholder="Nhắn tin với tư cách tài khoản này…"
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    />
                    <button className="admv3-btn" onClick={send} disabled={!text.trim()}><Send size={14} /> Gửi</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showLixi && peer && (
        <LixiModal
          accountId={account.id}
          peerId={peer.peer_id}
          onClose={() => setShowLixi(false)}
          onSent={() => { setShowLixi(false); loadMsgs(peer.peer_id); loadThreads(); }}
        />
      )}
    </div>
  );
}

function previewOf(raw: string | null) {
  const s = (raw || "").trim();
  if (!s) return "—";
  if (s.includes(ACCEPT_TOKEN)) return ACCEPT_PREVIEW_TEXT;
  if (HONGBAO_TOKEN.test(s)) return "Lì xì";
  if (GIF_TOKEN.test(s)) return "Nhãn dán";
  return s;
}

/** Bao lì xì trong chat clone — clone có thể MỞ và nhận Xu như user thật. */
function RedPacketBubble({ packetId, accountId, onChanged }: {
  packetId: string; accountId: string; onChanged?: () => void;
}) {
  const [pkt, setPkt] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc("admin_internal_get_red_packet", {
        p_account: accountId, p_packet: packetId,
      });
      if (error) throw error;
      setPkt(data);
    } catch { /* ignore */ }
  }, [accountId, packetId]);

  useEffect(() => { load(); }, [load]);

  useRealtime(
    `adm-hongbao-${packetId}`,
    useMemo(() => [{ table: "chat_red_packets" as const, event: "UPDATE" as const, filter: `id=eq.${packetId}` }], [packetId]),
    useCallback(() => load(), [load]),
  );

  async function openIt() {
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_open_red_packet", {
        p_account: accountId, p_packet: packetId,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.message || "Không mở được bao lì xì");
      toast.success(
        data?.already_opened ? "Bao lì xì đã được mở trước đó" : `Đã nhận ${Number(data?.amount ?? 0).toLocaleString("vi-VN")} Xu`,
      );
      await load();
      onChanged?.();
    } catch (e: any) { toast.error(e?.message || "Không mở được bao lì xì"); }
    finally { setBusy(false); }
  }

  const opened = pkt?.status === "opened";
  const canOpen = !!pkt?.can_open;

  return (
    <div className="min-w-[180px]">
      <div className="inline-flex items-center gap-1 font-medium"><Gift size={14} /> Bao lì xì</div>
      <div className="text-xs opacity-80">{pkt?.wish || "Chúc may mắn!"}</div>
      <div className="text-xs mt-0.5">
        {Number(pkt?.amount ?? 0).toLocaleString("vi-VN")} Xu • {opened ? "Đã mở" : "Chưa mở"}
      </div>
      {canOpen && (
        <button
          className="mt-1 text-xs px-2 py-1 rounded-full bg-red-500 text-white disabled:opacity-60"
          onClick={openIt}
          disabled={busy}
        >
          {busy ? "Đang mở…" : "Mở nhận Xu"}
        </button>
      )}
    </div>
  );
}

function Bubble({ msg, mine, accountId, onChanged }: {

  msg: Msg; mine: boolean; accountId: string; onChanged?: () => void;
}) {
  const raw = (msg.content || "").trim();
  const gif = raw.match(GIF_TOKEN);
  const lixi = raw.match(/^\[\[HONGBAO:([0-9a-fA-F-]{36})\]\]$/);
  const image = (msg as any).image_url as string | undefined;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
        {lixi ? (
          <RedPacketBubble packetId={lixi[1]} accountId={accountId} onChanged={onChanged} />
        ) : gif ? (
          <img loading="lazy" decoding="async" src={gif[1]} alt="" className="max-h-40 rounded-lg" />
        ) : image ? (
          <img loading="lazy" decoding="async" src={image} alt="" className="max-h-40 rounded-lg" />
        ) : (
          raw
        )}
        {msg.created_at && (
          <div className={`text-[10px] mt-0.5 ${mine ? "opacity-70" : "text-muted-foreground"}`}>
            {relTime(msg.created_at)}
          </div>
        )}
      </div>
    </div>
  );

}

function LixiModal({ accountId, peerId, onClose, onSent }: {
  accountId: string; peerId: string; onClose: () => void; onSent: () => void;
}) {
  const [amount, setAmount] = useState("10000");
  const [wish, setWish] = useState("Chúc bạn may mắn!");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_send_red_packet", {
        p_account: accountId, p_peer: peerId,
        p_amount: Number(amount), p_wish: wish.trim() || null,
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.message || "Gửi lì xì thất bại");
      toast.success("Đã gửi lì xì");
      onSent();
    } catch (e: any) { toast.error(e?.message || "Gửi lì xì thất bại"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-3 flex items-center gap-2"><Gift size={16} /> Gửi bao lì xì</div>
        <label className="block mb-2">
          <div className="text-xs text-muted-foreground mb-1">Số Xu (tối thiểu 1.000)</div>
          <input type="number" min={1000} className="admv3-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Lời chúc</div>
          <input className="admv3-input" value={wish} onChange={(e) => setWish(e.target.value)} maxLength={100} />
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <button className="admv3-btn admv3-btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="admv3-btn" onClick={run} disabled={busy || Number(amount) < 1000}>
            <Send size={14} /> {busy ? "Đang gửi…" : "Gửi"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Posting -------------------------------- */
export function PostTab({ accounts }: { accounts: AccountLite[] }) {
  const [accountId, setAccountId] = useState("");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);
  const [showGif, setShowGif] = useState(false);
  const [gif, setGif] = useState<string | null>(null);
  const [showVipGif, setShowVipGif] = useState(false);
  const vipGifAnchor = useRef<HTMLButtonElement | null>(null);

  const [showVoice, setShowVoice] = useState(false);
  const [voice, setVoice] = useState<VoiceLibraryItem | null>(null);
  // Link chip giống hệt bài user thật (facebook_url + zalo_url).
  const [facebookUrl, setFacebookUrl] = useState("");
  const [zaloUrl, setZaloUrl] = useState("");


  const [postFilter, setPostFilter] = useState<CloneFilterValue>(EMPTY_CLONE_FILTER);
  const postCloneIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const postCloneMeta = useProfileMeta(postCloneIds);
  const filteredAccounts = useMemo(
    () => filterByMeta(accounts, postCloneMeta, postFilter.gender, postFilter.province),
    [accounts, postCloneMeta, postFilter],
  );

  const urls = useMemo(
    () => media.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    [media],
  );

  function addUrl(u: string) {
    setMedia((m) => (m.trim() ? `${m.trim()}\n${u}` : u));
  }

  async function uploadFiles(files: FileList) {
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const url = await uploadClonePostMediaUrl(f);
        addUrl(url);
      }
      toast.success("Đã tải lên");
    } catch (e: any) { toast.error(e?.message || "Upload thất bại"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function publish() {
    if (!accountId) { toast.error("Chọn tài khoản đăng bài"); return; }
    if (!content.trim() && !urls.length && !gif && !voice) { toast.error("Nội dung trống"); return; }
    setBusy(true);
    try {
      // GIF / Voice được nhúng bằng token — giống hệt bài của user thật.
      const parts = [content.trim()];
      if (gif) parts.push(`[[gif:${gif}]]`);
      if (voice) parts.push(voiceToken(voice.storage_path, voice.duration));
      const body = parts.filter(Boolean).join("\n");
      // Bài viết của Clone được tạo thẳng trên Supabase #3 (nguồn của Feed).
      await createClonePostSb3({
        accountId,
        content: body,
        imageUrls: urls.length ? urls : null,
        visibility: "home",
        facebookUrl: facebookUrl.trim() || null,
        zaloUrl: zaloUrl.trim() || null,
      });
      toast.success("Đã đăng bài");
      setContent(""); setMedia(""); setGif(null); setVoice(null); setFacebookUrl(""); setZaloUrl("");
    } catch (e: any) { toast.error(e?.message || "Đăng bài thất bại"); }
    finally { setBusy(false); }
  }

  return (
    <div className="admv3-card p-3 max-w-3xl">
      <CloneFilterBar value={postFilter} onChange={setPostFilter} />
      <AccountPicker accounts={filteredAccounts} value={accountId} onChange={setAccountId} label="Đăng dưới tài khoản" />
      <label className="block mt-3">
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <Link2 size={12} /> Nội dung (hỗ trợ text + link)
        </div>
        <textarea className="admv3-input" rows={4} value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="Nội dung bài viết… có thể dán link" />
      </label>

      <div className="flex items-center gap-1 mt-3 relative">
        <button className="admv3-btn admv3-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} Ảnh / Video
        </button>
        <button ref={gifAnchor} className="admv3-btn admv3-btn-ghost" onClick={() => setShowGif((v) => !v)}>
          <Sticker size={14} /> GIF
        </button>
        <button className="admv3-btn admv3-btn-ghost" onClick={() => setShowVoice(true)}>
          <Mic size={14} /> Voice Bài Viết
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
          onChange={(e) => { const f = e.target.files; if (f?.length) uploadFiles(f); }} />
        <GifPicker open={showGif} onClose={() => setShowGif(false)}
          onPick={(u) => { setGif(u); setShowGif(false); }} anchorRef={gifAnchor} />
        <button ref={vipGifAnchor} className="admv3-btn admv3-btn-ghost" title="VIP GIF (Quản Lý Icon VIP)"
          onClick={() => setShowVipGif((v) => !v)}><Crown size={14} /> VIP GIF</button>
        <VipGifPicker open={showVipGif} onClose={() => setShowVipGif(false)} anchorRef={vipGifAnchor}
          onPick={(u) => { setGif(u); setShowVipGif(false); }} />
        <VoiceLibraryPicker
          open={showVoice}
          title="Voice Bài Viết"
          onClose={() => setShowVoice(false)}
          onPick={(item) => { setVoice(item); setShowVoice(false); }}
        />
      </div>

      {gif && (
        <div className="relative w-fit mt-2">
          <img loading="lazy" decoding="async" src={gif} alt="" className="max-h-40 rounded-lg border" />
          <button className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5"
            onClick={() => setGif(null)}><X size={12} /></button>
        </div>
      )}

      {voice && (
        <div className="mt-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-muted">
          <Mic size={12} /> {voice.title}
          <button onClick={() => setVoice(null)}><X size={12} /></button>
        </div>
      )}




      <label className="block mt-3">
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <Video size={12} /> Media đính kèm — mỗi URL một dòng
        </div>
        <textarea className="admv3-input" rows={3} value={media} onChange={(e) => setMedia(e.target.value)}
          placeholder="https://…/anh.jpg&#10;https://…/vui.gif&#10;https://…/video.mp4" />
      </label>
      {urls.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-2">
          {urls.map((u, i) => (/\.(mp4|webm|mov)$/i.test(u)
            ? <video preload="none" key={i} src={u} className="w-16 h-16 rounded object-cover border" muted />
            : <img loading="lazy" decoding="async" key={i} src={u} alt="" className="w-16 h-16 rounded object-cover border" />))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">🔗 Link Facebook (tuỳ chọn)</div>
          <input className="admv3-input" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)}
            placeholder="https://facebook.com/…" />
        </label>
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">💬 Link Zalo (tuỳ chọn)</div>
          <input className="admv3-input" value={zaloUrl} onChange={(e) => setZaloUrl(e.target.value)}
            placeholder="https://zalo.me/…" />
        </label>
      </div>
      <div className="flex justify-end mt-3">
        <button className="admv3-btn" onClick={publish} disabled={busy}><Send size={14} /> {busy ? "Đang đăng…" : "Đăng bài"}</button>
      </div>
    </div>
  );
}

/* ---------------------------- Batch comments ----------------------------- */
export function CommentsTab({ selected }: { selected: AccountLite[] }) {
  const [postId, setPostId] = useState("");
  const [lines, setLines] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => lines.split("\n").map((l) => l.trim()).filter(Boolean), [lines]);
  const mismatch = list.length !== selected.length;

  async function run() {
    if (!postId.trim()) { toast.error("Nhập ID bài viết"); return; }
    if (!selected.length) { toast.error("Chưa chọn tài khoản nào ở tab Danh sách"); return; }
    if (mismatch) { toast.error(`Số dòng (${list.length}) phải bằng số tài khoản đã chọn (${selected.length})`); return; }
    setBusy(true);
    try {
      // `comments` đã cutover sang Supabase #3.
      const sent = await insertCloneCommentsSb3(
        [postId.trim()],
        selected.map((a) => a.id),
        list,
      );
      toast.success(`Đã gửi ${sent} bình luận`);
      setLines("");
    } catch (e: any) { toast.error(e?.message || "Bình luận thất bại"); }
    finally { setBusy(false); }
  }

  return (
    <div className="admv3-card p-3 max-w-3xl">
      <div className="text-xs text-muted-foreground mb-3">
        Đang chọn <b>{selected.length}</b> tài khoản (chọn ở tab Danh sách). Mỗi dòng = 1 bình luận của 1 tài khoản theo thứ tự.
      </div>
      <label className="block">
        <div className="text-xs text-muted-foreground mb-1">ID bài viết</div>
        <input className="admv3-input" value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="UUID bài viết" />
      </label>
      <label className="block mt-3">
        <div className="text-xs text-muted-foreground mb-1">Nội dung bình luận (mỗi dòng một bình luận)</div>
        <textarea className="admv3-input" rows={8} value={lines} onChange={(e) => setLines(e.target.value)} />
      </label>
      <div className={`mt-2 text-xs ${mismatch ? "text-red-500" : "text-emerald-600"}`}>
        {list.length} dòng / {selected.length} tài khoản {mismatch ? "— chưa khớp" : "— hợp lệ"}
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {selected.slice(0, 12).map((a, i) => (
          <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-full bg-muted">
            {i + 1}. @{a.username}
          </span>
        ))}
        {selected.length > 12 && <span className="text-[11px] text-muted-foreground">+{selected.length - 12}</span>}
      </div>
      <div className="flex justify-end mt-3">
        <button className="admv3-btn" onClick={run} disabled={busy || mismatch || !selected.length}>
          <Send size={14} /> {busy ? "Đang gửi…" : "Gửi bình luận"}
        </button>
      </div>
    </div>
  );
}
