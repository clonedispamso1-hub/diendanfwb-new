/**
 * Seed Chat Control — Admin reply realtime hộ nick ảo.
 *
 * Giao diện 3-cột (Messenger-style):
 *   LEFT   : danh sách seed accounts
 *   CENTER : danh sách user đang chat với seed đã chọn
 *   RIGHT  : khung chat realtime — admin gõ → user nhận realtime
 *
 * KHÔNG fake — tin nhắn ghi thật vào bảng `messages`, user nhận qua
 * Supabase realtime. Có typing indicator + online toggle + delay tự nhiên.
 */
import { getMessagePreview } from "@/lib/message-preview";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Send, Circle, Power, PowerOff, Trash2, RotateCcw, Loader2, Image as ImageIcon,
  Sparkles, Mic,
} from "lucide-react";
import {
  listAllSeedAccounts,
  listConversationsForSeed,
  loadSeedConversationMessages,
  adminReplyAsSeed,
  markSeedConversationRead,
  setSeedOnline,
  softDeleteSeedAccount,
  restoreSeedAccount,
  subscribeSeedMessages,
  type SeedAccount,
  type SeedConversation,
  type SeedMessage,
} from "@/lib/seed-chat-control";
import { useSendTyping, usePeerTyping } from "@/lib/seed-typing";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { voiceToken } from "@/lib/voice-chat";
import { RichText } from "@/lib/rich-content";

const QUICK_REPLIES = [
  "Hihi chào anh 🥰",
  "Em ở gần Q1 nè 👀",
  "Anh đang làm gì vậy?",
  "Em cũng đang rảnh nè",
  "Mai mình rảnh không, cafe nha ☕",
  "Anh dễ thương ghê 💕",
  "Em mới online đó, rep chậm thông cảm nha",
];

/** Random delay nhẹ để chat trông tự nhiên hơn (1.2s–2.8s). */
function naturalDelay(): Promise<void> {
  const ms = 1200 + Math.floor(Math.random() * 1600);
  return new Promise((r) => setTimeout(r, ms));
}

export function SeedChatControl() {
  const [seeds, setSeeds] = useState<SeedAccount[]>([]);
  const [loadingSeeds, setLoadingSeeds] = useState(true);
  const [selectedSeed, setSelectedSeed] = useState<SeedAccount | null>(null);
  const [seedSearch, setSeedSearch] = useState("");

  const [conversations, setConversations] = useState<SeedConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SeedConversation | null>(null);

  const [messages, setMessages] = useState<SeedMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showVoiceLib, setShowVoiceLib] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [naturalMode, setNaturalMode] = useState(true);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // -- Load seeds
  useEffect(() => {
    let alive = true;
    setLoadingSeeds(true);
    listAllSeedAccounts()
      .then((list) => { if (alive) setSeeds(list); })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setLoadingSeeds(false); });
    return () => { alive = false; };
  }, []);

  // -- Load conversations khi chọn seed
  useEffect(() => {
    if (!selectedSeed) { setConversations([]); setSelectedUser(null); return; }
    let alive = true;
    setLoadingConvs(true);
    listConversationsForSeed(selectedSeed.id)
      .then((list) => { if (alive) setConversations(list); })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setLoadingConvs(false); });
    return () => { alive = false; };
  }, [selectedSeed?.id]);

  // -- Load messages khi chọn user
  useEffect(() => {
    if (!selectedSeed || !selectedUser) { setMessages([]); return; }
    let alive = true;
    setLoadingMsgs(true);
    loadSeedConversationMessages(selectedSeed.id, selectedUser.user_id)
      .then((list) => { if (alive) setMessages(list); })
      .finally(() => { if (alive) setLoadingMsgs(false); });
    // Đánh dấu đã đọc
    void markSeedConversationRead(selectedSeed.id, selectedUser.user_id);
    return () => { alive = false; };
  }, [selectedSeed?.id, selectedUser?.user_id]);

  // -- Realtime subscribe tin nhắn mới
  useEffect(() => {
    if (!selectedSeed) return;
    const unsub = subscribeSeedMessages(selectedSeed.id, (msg) => {
      // Cập nhật conversation list (move-to-top + unread)
      setConversations((prev) => {
        const otherId = msg.sender_id === selectedSeed.id ? msg.receiver_id : msg.sender_id;
        const idx = prev.findIndex((c) => c.user_id === otherId);
        const isFromUser = msg.sender_id !== selectedSeed.id;
        if (idx < 0) {
          return [{
            user_id: otherId,
            user_name: "User mới",
            user_avatar: null,
            last_message: msg.content,
            last_message_at: msg.created_at,
            unread_count: isFromUser ? 1 : 0,
            last_sender_is_user: isFromUser,
          }, ...prev];
        }
        const updated = [...prev];
        const cur = { ...updated[idx] };
        cur.last_message = msg.content;
        cur.last_message_at = msg.created_at;
        cur.last_sender_is_user = isFromUser;
        if (isFromUser && (!selectedUser || selectedUser.user_id !== otherId)) {
          cur.unread_count += 1;
        }
        updated.splice(idx, 1);
        return [cur, ...updated];
      });

      // Append vào messages nếu đúng conversation đang mở
      if (selectedUser && (
        (msg.sender_id === selectedSeed.id && msg.receiver_id === selectedUser.user_id) ||
        (msg.sender_id === selectedUser.user_id && msg.receiver_id === selectedSeed.id)
      )) {
        setMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
          return [...prev, msg];
        });
        // auto-mark-read khi đang mở
        if (msg.sender_id === selectedUser.user_id) {
          void markSeedConversationRead(selectedSeed.id, selectedUser.user_id);
        }
      }
    });
    return unsub;
  }, [selectedSeed?.id, selectedUser?.user_id]);

  // -- Auto-scroll
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, selectedUser?.user_id]);

  // -- Typing indicators
  const sendTyping = useSendTyping(selectedSeed?.id, selectedUser?.user_id);
  const userTyping = usePeerTyping(selectedSeed?.id, selectedUser?.user_id);

  const filteredSeeds = useMemo(() => {
    const q = seedSearch.trim().toLowerCase();
    if (!q) return seeds;
    return seeds.filter((s) =>
      (s.display_name || "").toLowerCase().includes(q) ||
      (s.username || "").toLowerCase().includes(q),
    );
  }, [seeds, seedSearch]);

  /**
   * Clone gửi voice: KHÔNG ghi âm, chỉ tham chiếu file đã có trong Storage
   * (thư viện Voice của Admin) — không upload lại.
   */
  const handleSendVoice = async (storagePath: string, duration: number) => {
    if (!selectedSeed || !selectedUser || sending) return;
    setShowVoiceLib(false);
    setSending(true);
    try {
      await adminReplyAsSeed(selectedSeed.id, selectedUser.user_id, voiceToken(storagePath, duration));
    } catch (e: any) {
      alert("Gửi voice thất bại: " + (e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!selectedSeed || !selectedUser || !text.trim() || sending) return;
    const content = text.trim();
    setSending(true);
    try {
      if (naturalMode) await naturalDelay();
      await adminReplyAsSeed(selectedSeed.id, selectedUser.user_id, content);
      setText("");
      setShowQuick(false);
    } catch (e: any) {
      alert("Gửi thất bại: " + (e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const handleToggleOnline = async (seed: SeedAccount, online: boolean) => {
    await setSeedOnline(seed.id, online);
    setSeeds((prev) => prev.map((s) =>
      s.id === seed.id ? { ...s, admin_online: online } as any : s,
    ));
  };

  const handleSoftDelete = async (seed: SeedAccount) => {
    if (!window.confirm(`Ngừng hoạt động "${seed.display_name}"?\n\nLịch sử chat của user sẽ vẫn còn. Có thể khôi phục.`)) return;
    await softDeleteSeedAccount(seed.id);
    setSeeds((prev) => prev.map((s) =>
      s.id === seed.id ? { ...s, seed_status: "inactive" } : s,
    ));
  };

  const handleRestore = async (seed: SeedAccount) => {
    await restoreSeedAccount(seed.id);
    setSeeds((prev) => prev.map((s) =>
      s.id === seed.id ? { ...s, seed_status: "active" } : s,
    ));
  };

  return (
    <div className="seed-chat-ctrl">
      {/* ===================== LEFT: SEED LIST ===================== */}
      <aside className="scc-col scc-seeds">
        <header>
          <div className="scc-title"><Sparkles size={16} /> Seed Accounts</div>
          <div className="scc-search">
            <Search size={14} />
            <input
              placeholder="Tìm nick ảo..."
              value={seedSearch}
              onChange={(e) => setSeedSearch(e.target.value)}
            />
          </div>
        </header>
        <div className="scc-list">
          {loadingSeeds ? (
            <div className="scc-empty"><Loader2 className="spin" size={16} /> Đang tải...</div>
          ) : filteredSeeds.length === 0 ? (
            <div className="scc-empty">Chưa có seed nào.</div>
          ) : filteredSeeds.map((s) => {
            const isActive = selectedSeed?.id === s.id;
            const inactive = s.seed_status === "inactive";
            return (
              <button
                key={s.id}
                className={`scc-seed-row ${isActive ? "is-active" : ""} ${inactive ? "is-inactive" : ""}`}
                onClick={() => setSelectedSeed(s)}
              >
                <div className="scc-avatar-wrap">
                  {s.avatar ? (
                    <img loading="lazy" decoding="async" src={s.avatar} alt="" />
                  ) : (
                    <div className="scc-avatar-fallback">{(s.display_name || "?").slice(0, 1)}</div>
                  )}
                  {(s as any).admin_online && <span className="scc-dot online" />}
                </div>
                <div className="scc-seed-info">
                  <div className="scc-seed-name">
                    {s.display_name}
                    {inactive && <span className="scc-badge-inactive">Ngừng</span>}
                  </div>
                  <div className="scc-seed-meta">@{s.username || "—"} · {s.province || "—"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ===================== CENTER: CONVERSATIONS ===================== */}
      <section className="scc-col scc-convs">
        {!selectedSeed ? (
          <div className="scc-blank">Chọn 1 seed account ở cột trái để xem các cuộc chat.</div>
        ) : (
          <>
            <header className="scc-conv-header">
              <div>
                <div className="scc-title">Đang chat với {selectedSeed.display_name}</div>
                <div className="scc-sub">{conversations.length} cuộc trò chuyện</div>
              </div>
              <div className="scc-actions">
                {selectedSeed.seed_status === "active" ? (
                  <>
                    <button
                      className="scc-btn-ghost"
                      onClick={() => handleToggleOnline(selectedSeed, !(selectedSeed as any).admin_online)}
                      title="Bật/tắt online"
                    >
                      {(selectedSeed as any).admin_online ? <Power size={14} /> : <PowerOff size={14} />}
                      {(selectedSeed as any).admin_online ? "Online" : "Offline"}
                    </button>
                    <button className="scc-btn-danger" onClick={() => handleSoftDelete(selectedSeed)} title="Ngừng hoạt động">
                      <Trash2 size={14} /> Ngừng
                    </button>
                  </>
                ) : (
                  <button className="scc-btn-ghost" onClick={() => handleRestore(selectedSeed)}>
                    <RotateCcw size={14} /> Khôi phục
                  </button>
                )}
              </div>
            </header>
            <div className="scc-list">
              {loadingConvs ? (
                <div className="scc-empty"><Loader2 className="spin" size={16} /> Đang tải...</div>
              ) : conversations.length === 0 ? (
                <div className="scc-empty">Chưa ai nhắn với seed này.</div>
              ) : conversations.map((c) => {
                const isActive = selectedUser?.user_id === c.user_id;
                return (
                  <button
                    key={c.user_id}
                    className={`scc-conv-row ${isActive ? "is-active" : ""}`}
                    onClick={() => {
                      setSelectedUser(c);
                      setConversations((prev) => prev.map((x) =>
                        x.user_id === c.user_id ? { ...x, unread_count: 0 } : x,
                      ));
                    }}
                  >
                    <div className="scc-avatar-wrap">
                      {c.user_avatar ? (
                        <img loading="lazy" decoding="async" src={c.user_avatar} alt="" />
                      ) : (
                        <div className="scc-avatar-fallback">{(c.user_name || "?").slice(0, 1)}</div>
                      )}
                    </div>
                    <div className="scc-conv-info">
                      <div className="scc-conv-name">
                        {c.user_name}
                        {c.unread_count > 0 && <span className="scc-badge-unread">{c.unread_count}</span>}
                      </div>
                      <div className="scc-conv-preview">
                        {c.last_sender_is_user ? "" : "Bạn: "}{getMessagePreview(c.last_message, !c.last_sender_is_user)}
                      </div>
                    </div>
                    <div className="scc-conv-time">{formatTime(c.last_message_at)}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ===================== RIGHT: CHAT ===================== */}
      <section className="scc-col scc-chat">
        {!selectedSeed || !selectedUser ? (
          <div className="scc-blank">Chọn 1 cuộc chat để bắt đầu rep.</div>
        ) : (
          <>
            <header className="scc-chat-header">
              <div className="scc-avatar-wrap sm">
                {selectedUser.user_avatar ? (
                  <img loading="lazy" decoding="async" src={selectedUser.user_avatar} alt="" />
                ) : (
                  <div className="scc-avatar-fallback">{(selectedUser.user_name || "?").slice(0, 1)}</div>
                )}
              </div>
              <div className="scc-chat-id">
                <div className="scc-chat-name">{selectedUser.user_name}</div>
                <div className="scc-chat-sub">
                  Đang rep với tư cách <b>{selectedSeed.display_name}</b>
                  {userTyping && <span className="scc-typing"> · đang nhập…</span>}
                </div>
              </div>
              <label className="scc-toggle">
                <input
                  type="checkbox"
                  checked={naturalMode}
                  onChange={(e) => setNaturalMode(e.target.checked)}
                />
                Delay tự nhiên
              </label>
            </header>

            <div className="scc-chat-scroll" ref={scrollerRef}>
              {loadingMsgs ? (
                <div className="scc-empty"><Loader2 className="spin" size={16} /> Đang tải...</div>
              ) : messages.length === 0 ? (
                <div className="scc-empty">Chưa có tin nhắn nào.</div>
              ) : messages.map((m) => {
                const mine = m.sender_id === selectedSeed.id; // "mine" = seed reply
                return (
                  <div key={String(m.id)} className={`scc-bubble ${mine ? "is-mine" : ""}`}>
                    <div className="scc-bubble-content">
                      <RichText text={m.content} />
                    </div>
                    <div className="scc-bubble-time">{formatTime(m.created_at)}</div>
                  </div>
                );
              })}
            </div>

            {selectedSeed.seed_status === "inactive" ? (
              <div className="scc-inactive-bar">
                Seed này đã ngừng hoạt động. Không thể gửi tin mới.
                <button className="scc-btn-ghost" onClick={() => handleRestore(selectedSeed)}>
                  <RotateCcw size={14} /> Khôi phục
                </button>
              </div>
            ) : (
              <div className="scc-composer">
                {showQuick && (
                  <div className="scc-quick">
                    {QUICK_REPLIES.map((q) => (
                      <button key={q} onClick={() => { setText(q); setShowQuick(false); }}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="scc-quick-btn"
                  onClick={() => setShowQuick((s) => !s)}
                  title="Tin nhanh"
                >
                  <ImageIcon size={16} />
                </button>
                <button
                  className="scc-quick-btn"
                  onClick={() => setShowVoiceLib(true)}
                  title="🎙 Gửi Voice (thư viện)"
                >
                  <Mic size={16} />
                </button>
                <VoiceLibraryPicker
                  open={showVoiceLib}
                  onClose={() => setShowVoiceLib(false)}
                  onPick={(item) => void handleSendVoice(item.storage_path, item.duration)}
                />
                <textarea
                  placeholder={`Rep với tư cách ${selectedSeed.display_name}...`}
                  value={text}
                  onChange={(e) => { setText(e.target.value); sendTyping(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={1}
                />
                <button
                  className="scc-send"
                  onClick={() => void handleSend()}
                  disabled={!text.trim() || sending}
                >
                  {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <style>{`
        .seed-chat-ctrl {
          display: grid;
          grid-template-columns: 260px 320px 1fr;
          gap: 0;
          height: calc(100vh - 200px);
          min-height: 520px;
          background: #0b1220;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .scc-col { display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,0.06); min-width: 0; }
        .scc-col:last-child { border-right: 0; }
        .scc-col header { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .scc-title { display:flex; align-items:center; gap:6px; font-weight: 600; color: #fff; font-size: 13px; }
        .scc-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .scc-search { display:flex; align-items:center; gap:6px; margin-top: 8px; background: rgba(255,255,255,0.04); padding: 6px 8px; border-radius: 8px; }
        .scc-search input { flex: 1; background: transparent; border: 0; outline: 0; color: #fff; font-size: 12px; }
        .scc-list { flex: 1; overflow-y: auto; padding: 4px; }
        .scc-empty, .scc-blank { padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
        .scc-blank { display:flex; align-items:center; justify-content:center; height: 100%; }
        .scc-seed-row, .scc-conv-row {
          width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px;
          background: transparent; border: 0; color: #e2e8f0; text-align: left;
          border-radius: 8px; cursor: pointer; transition: background .15s;
        }
        .scc-seed-row:hover, .scc-conv-row:hover { background: rgba(255,255,255,0.04); }
        .scc-seed-row.is-active, .scc-conv-row.is-active { background: rgba(236,72,153,0.12); }
        .scc-seed-row.is-inactive { opacity: 0.55; filter: grayscale(0.6); }
        .scc-avatar-wrap { position:relative; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #1e293b; }
        .scc-avatar-wrap.sm { width: 32px; height: 32px; }
        .scc-avatar-wrap img { width:100%; height:100%; object-fit: cover; }
        .scc-avatar-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600; background:linear-gradient(135deg,#ec4899,#a855f7); }
        .scc-dot { position:absolute; bottom:0; right:0; width:10px; height:10px; border-radius:50%; border:2px solid #0b1220; }
        .scc-dot.online { background: #22c55e; }
        .scc-seed-info, .scc-conv-info { flex: 1; min-width: 0; }
        .scc-seed-name, .scc-conv-name { font-size: 13px; font-weight: 600; color: #fff; display:flex; align-items:center; gap:6px; }
        .scc-seed-meta, .scc-conv-preview { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .scc-conv-time { font-size: 10px; color: #64748b; flex-shrink: 0; }
        .scc-badge-inactive { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: #475569; color: #fff; }
        .scc-badge-unread { font-size: 10px; min-width: 18px; padding: 1px 6px; border-radius: 9px; background: #ec4899; color: #fff; text-align:center; }
        .scc-conv-header { display:flex; align-items:center; justify-content:space-between; }
        .scc-actions { display:flex; gap: 6px; }
        .scc-btn-ghost, .scc-btn-danger {
          display:inline-flex; align-items:center; gap:4px; padding: 4px 8px; border-radius: 6px;
          font-size: 11px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #e2e8f0;
        }
        .scc-btn-ghost:hover { background: rgba(255,255,255,0.04); }
        .scc-btn-danger { color: #f87171; border-color: rgba(248,113,113,0.4); }
        .scc-btn-danger:hover { background: rgba(248,113,113,0.1); }
        .scc-chat-header { display:flex; align-items:center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .scc-chat-id { flex: 1; min-width: 0; }
        .scc-chat-name { font-size: 13px; font-weight: 600; color: #fff; }
        .scc-chat-sub { font-size: 11px; color: #94a3b8; }
        .scc-typing { color: #22c55e; font-style: italic; }
        .scc-toggle { font-size: 11px; color: #94a3b8; display:flex; align-items:center; gap:4px; cursor:pointer; }
        .scc-chat-scroll { flex: 1; overflow-y: auto; padding: 14px; display:flex; flex-direction: column; gap: 8px; background: #0a0f1c; }
        .scc-bubble { max-width: 72%; padding: 8px 12px; border-radius: 14px; background: #1e293b; color: #e2e8f0; align-self: flex-start; }
        .scc-bubble.is-mine { align-self: flex-end; background: linear-gradient(135deg,#ec4899,#a855f7); color: #fff; }
        .scc-bubble-content { font-size: 13px; white-space: pre-wrap; word-break: break-word; }
        .scc-bubble-time { font-size: 9px; opacity: 0.7; margin-top: 2px; text-align: right; }
        .scc-composer { display:flex; align-items:flex-end; gap: 6px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); position: relative; }
        .scc-composer textarea {
          flex: 1; resize: none; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; color: #fff; padding: 8px 10px; font-size: 13px; outline: 0; max-height: 120px; min-height: 36px;
        }
        .scc-send, .scc-quick-btn {
          width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
          display:flex; align-items:center; justify-content:center; color: #fff;
        }
        .scc-send { background: linear-gradient(135deg,#ec4899,#a855f7); }
        .scc-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .scc-quick-btn { background: rgba(255,255,255,0.06); color: #94a3b8; }
        .scc-quick { position: absolute; bottom: 56px; left: 12px; right: 12px; background: #1e293b; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 6px; display: grid; gap: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 5; }
        .scc-quick button { text-align:left; padding: 6px 10px; border-radius: 6px; background: transparent; border: 0; color: #e2e8f0; cursor: pointer; font-size: 12px; }
        .scc-quick button:hover { background: rgba(255,255,255,0.06); }
        .scc-inactive-bar { padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(248,113,113,0.06); color: #fca5a5; font-size: 12px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .seed-chat-ctrl { grid-template-columns: 1fr; height: auto; }
          .scc-col { border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.06); max-height: 320px; }
          .scc-col:last-child { max-height: 60vh; }
        }
      `}</style>
    </div>
  );
}

function formatTime(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export default SeedChatControl;
