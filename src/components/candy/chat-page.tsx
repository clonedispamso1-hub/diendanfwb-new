import type React from "react";
import { BaitGroupsList } from "@/components/candy/bait-groups-list";
import { HotBadge999 } from "@/components/candy/bait-groups-list";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Send, Plus, Users, MoreVertical, Phone, Video, Search, Pin, BellOff, Trash2, X, BellRing, PinOff, Copy, MoreHorizontal, Flag, Clock, Smile, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { RichText, gifToken } from "@/lib/rich-content";
import { GifPicker } from "@/components/candy/gif-picker";
import { supabase } from "@/lib/supabase";
import { fetchProfileById, peekProfile } from "@/lib/profile-cache";
import { usePrefetchProfile } from "@/hooks/use-profile-query";

const CHAT_PARTNER_PROFILE_COLS = "id, username, full_name, display_name, avatar, avatar_url, bio, location, province, followers_count, vip_level, vip_exp, role, is_admin, is_online, is_banned, banned_until, status, trust_score, last_seen, title_gif_url, is_virtual, height, weight, intent, gender, public_id, is_seed_account, seed_status, relationship_status, age, is_fwb_active, interests, is_clone, verified, city, nickname, birthday, zodiac, badge_id, vip_media, call_video_url, call_voice_url, identity_crown, identity_pet, identity_flag";

import type { MessageRecord, Profile } from "@/lib/app-types";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { createMessageCompat } from "@/lib/db-compat";
import { ReportRewardModal } from "@/components/candy/report-reward-modal";
import UniversalBadge from "@/components/candy/universal-badge";
import { GenderIcon } from "@/components/candy/gender-icon";
import { useIsOnline, formatLastSeen } from "@/lib/presence";
import { PresenceDot, PresenceStatus } from "@/components/candy/presence-status";
import { sendVirtualMessage } from "@/lib/virtual-profiles";
import { CreateGroupModal } from "@/components/candy/create-group-modal";
import { GroupChatPage } from "@/components/candy/group-chat-page";
import { ChatCompatibilityHeader } from "@/components/candy/chat-compatibility-header";
import { useMessageReactions, REACTION_EMOJIS } from "@/lib/message-reactions";
import { ReactionViewer } from "@/components/candy/reaction-viewer";
import { usePeerTyping, useSendTyping } from "@/lib/seed-typing";
import { Mic, Library } from "lucide-react";
import { VoiceRecorder } from "@/components/candy/voice-recorder";
import { getMessagePreview, isVoiceMessage } from "@/lib/message-preview";
import { VoiceBubble } from "@/components/candy/voice-bubble";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { ZaloVipLockModal } from "@/components/candy/zalo-vip-lock-modal";
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";
import { canSendVoice, parseVoiceMarker, uploadVoiceBlob, voiceToken, voiceVipLockMessage } from "@/lib/voice-chat";
import {
  clearCachedMessages,
  deleteMessageForMe,
  fetchLatestPage,
  fetchOlderPage,
  getCachedMessages,
  hideConversationForMe,
  prefetchConversation,
  setCachedMessages,
  visibleForMe,
} from "@/lib/chat-cache";
import {
  hiddenMessageIds,
  hideMessagesForMe,
  onHiddenMessagesChange,
} from "@/lib/chat-hidden-messages";
import { messageCutoffMs, purgeExpiredChatData } from "@/lib/message-retention";
import { loadKnownPartners, rememberPartners, forgetPartner } from "@/lib/chat-partners";
import {
  acceptSystemContent,
  acceptSystemText,
  computeRequestState,
  isAcceptSystemMessage,
  PENDING_LOCKED_TEXT,
} from "@/lib/message-requests";

import { usePeerViewingChat } from "@/lib/chat-view-presence";
import { VipMedia } from "@/components/vip/vip-media";
import { vipIconSize } from "@/lib/vip-sizes";
import { MessageResetCountdown } from "@/components/candy/reset-countdown";
import { chatDb } from "@/lib/chat-db";
import { ensureClearsMap, fetchClearsMap, primeClearsCache, setLocalClear } from "@/lib/chat-clears";
import { resolveUserName, isLockedAccount, LOCKED_USER_NAME } from "@/lib/user-name";





type InboxItem =
  | { kind: "dm"; partnerId: string; profile: any; lastMessage: any; unread: number; sortTs: number }
  | { kind: "group"; groupId: string; name: string; lastPreview: string; lastSenderId: string | null; sortTs: number; memberCount: number };

const PIN_LIMIT = 3;

/** localStorage helpers cho pin / mute chat (chỉ ở client). */
function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function writeSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch { /* */ }
}
const pinKey = (meId: string) => `chat.pinned::${meId}`;
const muteKey = (meId: string) => `chat.muted::${meId}`;

const REACTIONS: readonly string[] = REACTION_EMOJIS;

/** Format mốc thời gian ở giữa cuộc trò chuyện (Messenger-style). */
function formatDivider(input?: string | number | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
    if (diffMin < 1) return "Vừa xong";
    if (diffMin < 60) return `${diffMin} phút trước`;
    return `Hôm nay ${hm}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Hôm qua ${hm}`;
  const diffDay = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDay < 7) {
    const wd = d.toLocaleDateString("vi-VN", { weekday: "short" });
    return `${wd} ${hm}`;
  }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} • ${hm}`;
}

/**
 * Mốc "Xoá cuộc trò chuyện" đến từ src/lib/chat-clears.ts (nguồn duy nhất).
 * `ensureClearsMap` có cache + dedupe → openChat() gọi được ngay cả khi effect
 * nạp map chưa chạy xong (fix race condition mở chat từ Hồ sơ).
 */





interface ChatPageProps {
  targetUserId: string | null;
  onOpenProfile: (userId: string) => void;
}

/** Định dạng thời gian preview giống Zalo/Telegram. */
function formatChatListTime(input?: string | number | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  const ts = d.getTime();
  if (Number.isNaN(ts)) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
  const diffDay = Math.floor((now.getTime() - ts) / 86_400_000);
  if (diffDay < 7) return d.toLocaleDateString("vi-VN", { weekday: "short" });
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}



/** Nội dung preview cho hàng chat list — dùng helper chung getMessagePreview. */
function previewForMessage(msg: any, isSelfLast: boolean): string {
  if (!msg) return "Tin nhắn mới";
  const text = getMessagePreview(msg, isSelfLast);
  return text;
}

/** Handler long-press (~450ms) dùng cho hàng danh sách chat. */
function longPressProps(onLongPress: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  let sx = 0;
  let sy = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      sx = e.clientX; sy = e.clientY; fired = false;
      clear();
      timer = setTimeout(() => { fired = true; onLongPress(); }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture: (e: React.MouseEvent) => {
      if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; }
    },
  };
}

export function ChatPage({ targetUserId, onOpenProfile }: ChatPageProps) {
  const { me } = useAuth();
  const [activeChat, setActiveChat] = useState<string | null>(targetUserId);
  const [activeName, setActiveName] = useState("");
  const [activePartner, setActivePartner] = useState<Partial<Profile> | null>(null);
  const [chatList, setChatList] = useState<InboxItem[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [text, setText] = useState("");
  const [blockedRel, setBlockedRel] = useState<{ iBlocked: boolean; theyBlocked: boolean }>({ iBlocked: false, theyBlocked: false });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showVipGate, setShowVipGate] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // CALL V1 — gọi thoại / video mô phỏng (không WebRTC).
  const [callNotice, setCallNotice] = useState<"voice" | "video" | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  /** Phân trang tin nhắn: còn tin cũ hơn để tải không? */
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  // V6 perf: refs để realtime channel KHÔNG phải resubscribe mỗi lần đổi cuộc trò chuyện.
  const activeChatRef = useRef<string | null>(targetUserId ?? null);
  const hasMoreOlderRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);

  // clearedMap[partnerId] = epoch(ms) khi user hiện tại đã "Xoá cuộc trò chuyện".
  // Nguồn dữ liệu = DB bảng conversation_clears (per-user, per-partner).
  // Mọi câu query message trong file này đều lọc theo `created_at > cleared_at`.
  const [clearedMap, setClearedMap] = useState<Record<string, number>>({});
  const clearedMapRef = useRef<Record<string, number>>({});
  useEffect(() => { clearedMapRef.current = clearedMap; }, [clearedMap]);
  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; name: string }>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notMatched, setNotMatched] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRecord | null>(null);
  const [msgMenu, setMsgMenu] = useState<{ message: MessageRecord; isSelf: boolean } | null>(null);
  const [editingMsg, setEditingMsg] = useState<{ id: string; text: string } | null>(null);
  const [confirmRecall, setConfirmRecall] = useState<{ id: string } | null>(null);
  const [flashReplyId, setFlashReplyId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ targetId: string; messageId: string; text: string } | null>(null);
  const [reactionViewerMsgId, setReactionViewerMsgId] = useState<string | null>(null);
  /** Id tin nhắn đang hiển thị thời gian ("Xem thời gian" trong menu). Tự ẩn sau ~4s. */
  const [timeVisibleId, setTimeVisibleId] = useState<string | null>(null);
  /** Tin nhắn đã "Xoá (chỉ mình tôi)" — chỉ lưu local, không đụng DB. */
  const [hiddenMsgIds, setHiddenMsgIds] = useState<Set<string>>(new Set());
  /** Long-press một cuộc trò chuyện trong danh sách → bottom sheet. */
  const [convMenu, setConvMenu] = useState<null | { id: string; name: string; kind: "dm" | "group" }>(null);
  /** Tìm kiếm & tab lọc danh sách hội thoại. */
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxTab, setInboxTab] = useState<"dm" | "group">("dm");
  /** Badge "999+" tạm ẩn khi user đang xem tab Nhóm; bật lại khi rời tab. */
  const [groupBadgeSeen, setGroupBadgeSeen] = useState(false);
  useEffect(() => {
    if (!timeVisibleId) return;
    const t = window.setTimeout(() => setTimeVisibleId(null), 4000);
    return () => window.clearTimeout(t);
  }, [timeVisibleId]);

  // ===== Optimistic send (frontend-only) =====
  const peerTyping = usePeerTyping(me?.id ?? null, activeChat);
  /** Peer đang mở đúng cuộc trò chuyện này → 🟢 "Đang xem". */
  const peerViewing = usePeerViewingChat(me?.id ?? null, activeChat);
  const sendTypingSignal = useSendTyping(me?.id ?? null, activeChat);

  // Gift feature removed from Chat UI.

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { hasMoreOlderRef.current = hasMoreOlder; }, [hasMoreOlder]);
  const {
    byMessage: reactionsByMessage,
    myReactionByMessage,
    toggleReaction,
  } = useMessageReactions(messageIds, me?.id ?? null);


  // Load local state + DB cleared markers khi user đổi.
  useEffect(() => {
    if (!me?.id) return;
    setPinnedIds(readSet(pinKey(me.id)));
    setMutedIds(readSet(muteKey(me.id)));
    setHiddenMsgIds(new Set(hiddenMessageIds(me.id)));
    void (async () => {
      const map = await ensureClearsMap(me.id);
      clearedMapRef.current = map;
      setClearedMap(map);
    })();
    // Tin nhắn / thông báo quá 72 giờ → dọn (best-effort, throttle 6h).
    void purgeExpiredChatData(me.id);
  }, [me?.id]);

  // Đồng bộ danh sách "đã xoá phía tôi" khi có thay đổi từ nơi khác trong app.
  useEffect(() => {
    if (!me?.id) return;
    return onHiddenMessagesChange((uid) => {
      if (uid !== me.id) return;
      const hidden = hiddenMessageIds(uid);
      setHiddenMsgIds(new Set(hidden));
      setMessages((cur) => cur.filter((m) => !hidden.has(String(m.id))));
    });
  }, [me?.id]);



  /** Cuộn đến tin nhắn gốc khi bấm vào block reply-quote. */
  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`message-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashReplyId(msgId);
    window.setTimeout(() => setFlashReplyId((cur) => (cur === msgId ? null : cur)), 1400);
  }, []);

  const localPinned = activeChat ? pinnedIds.has(activeChat) : false;
  const localMuted = activeChat ? mutedIds.has(activeChat) : false;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2000);
  };

  /** Toggle ghim — giới hạn 3, hiện popup nếu vượt. */
  const togglePin = (id: string) => {
    if (!me?.id) return;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast("Đã bỏ ghim");
      } else {
        if (next.size >= PIN_LIMIT) {
          showToast(`Bạn chỉ có thể ghim tối đa ${PIN_LIMIT} cuộc trò chuyện`);
          return prev;
        }
        next.add(id);
        showToast("Đã ghim đoạn chat");
      }
      writeSet(pinKey(me.id), next);
      return next;
    });
  };

  const toggleMute = (id: string) => {
    if (!me?.id) return;
    setMutedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); showToast("Đã bật thông báo"); }
      else { next.add(id); showToast("Đã tắt thông báo"); }
      writeSet(muteKey(me.id), next);
      return next;
    });
  };

  /**
   * "Xoá tin nhắn phía tôi" — ẩn TỨC THÌ khỏi React state (optimistic UI),
   * đồng thời ghi `auth.uid()` vào mảng `messages.deleted_by_users` để lần
   * sau vào lại vẫn ẩn. Phía đối phương không bị ảnh hưởng.
   */
  const deleteForMe = (message: MessageRecord) => {
    if (!me?.id) return;
    const id = message.id;
    setMessages((cur) => cur.filter((m) => m.id !== id));
    hideMessagesForMe(me.id, [id]);
    setHiddenMsgIds(new Set(hiddenMessageIds(me.id)));
    showToast("Đã xoá tin nhắn phía bạn");
    // Ghi xuống Supabase #3 qua RPC hide_message_for_me (đồng bộ đa thiết bị).
    void deleteMessageForMe(me.id, message as any).catch((e) => {
      console.warn("[chat] delete for me failed", e);
      showToast("Đã ẩn trên máy này, nhưng chưa đồng bộ được lên máy chủ");
    });
  };

  /**
   * "Xoá cuộc trò chuyện" — ghi mốc `cleared_at = now()` cho (me, partner) vào
   * bảng `conversation_clears`. KHÔNG xoá row nào trong bảng messages, không
   * ảnh hưởng phía còn lại. Từ nay các tin nhắn có `created_at <= cleared_at`
   * sẽ không bao giờ được hiển thị lại cho user hiện tại — dù mở từ Chat List,
   * Chat Page, Hồ sơ, Notification hay Search. Khi partner gửi tin mới, tin
   * đó có `created_at > cleared_at` nên sẽ tự hiện lại conversation.
   */
  const deleteChatLocally = async (id: string) => {
    if (!me?.id) return;
    // BƯỚC 1 — gọi RPC hide_conversation_for_me trên Supabase #3 TRƯỚC.
    // RPC thất bại → KHÔNG xoá UI/cache, báo lỗi thân thiện và dừng lại.
    try {
      await hideConversationForMe(me.id, id);
    } catch (e: any) {
      console.warn("[chat] hide conversation failed", e);
      showToast("Không xoá được cuộc trò chuyện, vui lòng thử lại sau");
      return;
    }

    // BƯỚC 2 — RPC thành công → mới xoá UI / cache / local state.
    const now = Date.now();
    const nextCleared = { ...clearedMapRef.current, [id]: now };
    setLocalClear(me.id, id, now);
    clearedMapRef.current = nextCleared;
    setClearedMap(nextCleared);
    setMessages([]);
    clearCachedMessages(me.id, id);
    // Ẩn ngay khỏi danh sách (kể cả khi hội thoại chưa có tin nhắn nào mới).
    setChatList((prev) => prev.filter((it) => !(it.kind === "dm" && it.partnerId === id)));
    // Quên partner để reload trang KHÔNG dựng lại hàng chat rỗng.
    void forgetPartner(me.id, id);
    if (activeChat === id) {
      setActiveChat(null);
      setActivePartner(null);
      setActiveName("");
    }
    // Ghi thêm mốc cleared_at (best-effort): đảm bảo mở lại từ Hồ sơ / reload
    // không bao giờ dựng lại tin cũ; tin mới sau mốc vẫn hiện bình thường.
    const { error } = await chatDb()
      .from("conversation_clears" as any)
      .upsert(
        { user_id: me.id, partner_id: id, cleared_at: new Date(now).toISOString() },
        { onConflict: "user_id,partner_id" },
      );
    if (error) {
      console.warn("[chat] clear marker failed (RPC đã ẩn tin)", error);
    }
    showToast("Đã xoá cuộc trò chuyện");
    // Đồng bộ lại clearedMap từ DB (phòng lệch giờ / lệch trigger).
    const fresh = await fetchClearsMap(me.id);
    primeClearsCache(me.id, fresh);
    clearedMapRef.current = fresh;
    setClearedMap(fresh);
    void loadChatList();
  };




  /** Chặn người dùng — ghi vào user_blocks và đóng cuộc trò chuyện. */
  const blockPartner = async (id: string) => {
    if (!me?.id) return;
    const { error } = await supabase
      .from("user_blocks" as any)
      .insert({ blocker_id: me.id, target_id: id } as any);
    if (error && error.code !== "23505") {
      showToast("Không chặn được: " + error.message);
      return;
    }
    setBlockedRel((b) => ({ ...b, iBlocked: true }));
    showToast("Đã chặn người dùng");
    if (activeChat === id) {
      setActiveChat(null);
      setActivePartner(null);
      setActiveName("");
    }
    void loadChatList();
  };

  /** Prefetch hồ sơ khi rê chuột vào avatar / tên → mở hồ sơ 0s delay. */
  const prefetchProfile = usePrefetchProfile(CHAT_PARTNER_PROFILE_COLS);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const partnerOnline = useIsOnline(activeChat, (activePartner as any)?.is_virtual);

  const title = useMemo(() => {
    if (!activeChat) return "Tin nhắn";
    return (
      activeName
      || (activePartner as any)?.full_name
      || (activePartner as any)?.username
      || (activePartner as any)?.display_name
      || "Đang tải…"
    );
  }, [activeChat, activeName, activePartner]);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) {
      // Cho tin nhắn mới đến: dùng smooth mượt.
      requestAnimationFrame(() => {
        const cur = scrollRef.current;
        if (!cur) return;
        cur.scrollTo({ top: cur.scrollHeight, behavior: "smooth" });
      });
    } else {
      // Mở chat: JUMP thẳng xuống đáy, không animation.
      el.scrollTop = el.scrollHeight;
    }
  };

  // Khi vừa mở/đổi conversation, bung sẵn scrollTop xuống đáy TRƯỚC khi paint
  // để không thấy tin nhắn cuộn từ trên xuống (giống Messenger).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingOlderRef.current) return; // đang chèn tin cũ lên đầu
    el.scrollTop = el.scrollHeight;
  }, [activeChat, messages.length]);

  const loadChatList = async () => {
    if (!me) return;
    // Refresh cleared markers từ DB TRƯỚC KHI dựng list — đảm bảo mọi lần load
    // (mount, sau khi xoá, sau khi có tin mới, sau khi chuyển tab) đều tôn
    // trọng mốc `cleared_at` mới nhất.
    const clears = await fetchClearsMap(me.id);
    primeClearsCache(me.id, clears);
    clearedMapRef.current = clears;
    setClearedMap(clears);

    const [{ data: dmData }, { data: myBlocks }, { data: blocksOnMe }, { data: myMemberships }] = await Promise.all([
      chatDb()
        .from("messages")
        // PERF: chỉ cần các tin gần nhất để dựng danh sách + badge chưa đọc.
        .select("id, sender_id, receiver_id, content, created_at, is_read, is_recalled, deleted_by_users")
        .or(`sender_id.eq.${me.id},receiver_id.eq.${me.id}`)
        .order("created_at", { ascending: false })
        .limit(250), // Egress: 250 tin gần nhất đủ dựng danh sách + badge (trước 600)
      supabase.from("user_blocks" as any).select("target_id").eq("blocker_id", me.id),
      supabase.from("user_blocks" as any).select("blocker_id").eq("target_id", me.id),
      supabase.from("group_members" as any).select("group_id").eq("user_id", me.id).is("left_at", null),
    ]);

    const blockedSet = new Set<string>([
      ...(((myBlocks as any[]) || []).map((b) => b.target_id)),
      ...(((blocksOnMe as any[]) || []).map((b) => b.blocker_id)),
    ]);

    // ----- DM section -----
    const latest = new Map<string, any>();
    const unreadByPartner = new Map<string, number>();
    const hiddenForMe = hiddenMessageIds(me.id);
    for (const item of dmData || []) {
      // "Xoá phía tôi": tin đã ẩn không được dựng lại preview trong danh sách.
      if (hiddenForMe.has(String(item.id))) continue;
      if (Array.isArray(item.deleted_by_users) && item.deleted_by_users.includes(me.id)) continue;
      const partnerId = item.sender_id === me.id ? item.receiver_id : item.sender_id;
      if (blockedSet.has(partnerId)) continue;
      // Áp dụng mốc "Xoá cuộc trò chuyện" + TTL 72 giờ: bỏ qua mọi message có
      // created_at <= mốc lớn hơn giữa cleared_at và cutoff 72h.
      const clearedAt = Math.max(clears[partnerId] ?? 0, messageCutoffMs());
      const msgTs = new Date(item.created_at ?? 0).getTime();
      if (clearedAt > 0 && msgTs <= clearedAt) continue;

      if (!latest.has(partnerId)) latest.set(partnerId, item);
      if (item.receiver_id === me.id && item.sender_id === partnerId && item.is_read === false) {
        unreadByPartner.set(partnerId, (unreadByPartner.get(partnerId) || 0) + 1);
      }
    }


    // MESSAGE SYSTEM V2: tin nhắn tự hủy sau 72h nhưng DANH SÁCH người từng
    // chat vẫn phải còn → hợp nhất partner đang có tin nhắn với partner đã lưu.
    const activePartnerIds = Array.from(latest.keys());
    void rememberPartners(me.id, activePartnerIds);
    const knownPartners = await loadKnownPartners(me.id);
    const partnerIds = Array.from(new Set([...activePartnerIds, ...knownPartners])).filter(
      (id) =>
        id && id !== me.id && !blockedSet.has(id)
        // Đã "Xoá cuộc trò chuyện" và chưa có tin mới sau mốc xoá → không dựng lại hàng.
        && !((clears[id] ?? 0) > 0 && !latest.has(id)),
    );

    // PERF: 1 query duy nhất cho toàn bộ partner (trước đây N query song song).
    let profileMap = new Map<string, any>();
    if (partnerIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar, vip_level, is_online, last_seen, is_virtual, gender, badge_id, is_admin, role, is_seed_account, is_clone, province")
        .in("id", partnerIds);
      profileMap = new Map(((profiles as any[]) || []).map((p) => [p.id as string, p]));
    }

    const dmRows: InboxItem[] = partnerIds
      .map((partnerId) => {
        const profile = profileMap.get(partnerId);
        if (!profile) return null;
        const lastMessage = latest.get(partnerId) ?? null;
        return {
          kind: "dm" as const,
          partnerId,
          profile,
          lastMessage,
          unread: unreadByPartner.get(partnerId) || 0,
          sortTs: new Date(lastMessage?.created_at ?? 0).getTime(),
        };
      })
      .filter(Boolean) as InboxItem[];



    // ----- Group section -----
    const groupIds = ((myMemberships as any[]) || []).map((r) => r.group_id);
    let groupRows: InboxItem[] = [];
    if (groupIds.length > 0) {
      const { data: groupsData } = await supabase
        .from("groups" as any)
        .select("id, name, last_message_at, created_at")
        .in("id", groupIds);

      // last message preview per group
      const previews = await Promise.all(
        groupIds.map(async (gid) => {
          const { data } = await supabase
            .from("group_messages" as any)
            .select("sender_id, content, created_at")
            .eq("group_id", gid)
            .eq("is_archived", false)
            .order("created_at", { ascending: false })
            .limit(1);
          return { gid, msg: (data as any[])?.[0] || null };
        }),
      );
      const previewMap = new Map(previews.map((p) => [p.gid, p.msg]));

      // member counts
      const counts = await Promise.all(
        groupIds.map(async (gid) => {
          const { count } = await supabase
            .from("group_members" as any)
            .select("user_id", { count: "exact", head: true })
            .eq("group_id", gid)
            .is("left_at", null);
          return { gid, count: count || 0 };
        }),
      );
      const countMap = new Map(counts.map((c) => [c.gid, c.count]));

      groupRows = ((groupsData as any[]) || []).map((g) => {
        const msg = previewMap.get(g.id);
        const ts = msg?.created_at || g.last_message_at || g.created_at;
        return {
          kind: "group" as const,
          groupId: g.id,
          name: g.name,
          lastPreview: msg?.content || "Chưa có tin nhắn",
          lastSenderId: msg?.sender_id || null,
          sortTs: ts ? new Date(ts).getTime() : 0,
          memberCount: countMap.get(g.id) || 0,
        };
      });
    }

    const merged = [...dmRows, ...groupRows].sort((a, b) => b.sortTs - a.sortTs);
    setChatList(merged);
  };

  /**
   * Mở/refresh tin nhắn của một cuộc trò chuyện.
   * - Có cache → render NGAY (mở gần như tức thì), rồi refresh nền.
   * - Chỉ tải CHAT_PAGE_SIZE tin gần nhất; tin cũ dùng infinite scroll.
   */
  const loadMessages = async (partnerId: string, opts?: { instant?: boolean }) => {
    if (!me) return;
    // FIX race condition: openChat() có thể chạy trước khi clearedMap được nạp.
    // ensureClearsMap() có cache + dedupe nên gần như không tốn thêm request.
    const clears = await ensureClearsMap(me.id);
    if (Object.keys(clears).length) {
      clearedMapRef.current = { ...clears, ...clearedMapRef.current };
    }
    const clearedAt = Math.max(clearedMapRef.current[partnerId] ?? 0, clears[partnerId] ?? 0);

    if (opts?.instant) {
      const cached = getCachedMessages(me.id, partnerId);
      if (cached) {
        // Khôi phục từ cache VẪN phải lọc deleted_by_users / danh sách ẩn —
        // mở lại từ Hồ sơ không bao giờ được dựng lại tin đã "xoá phía tôi".
        setMessages(visibleForMe(cached.rows as any[], me.id));
        setHasMoreOlder(cached.hasMore);
        scrollToBottom(false);
      }
    }

    const fresh = await fetchLatestPage(me.id, partnerId, clearedAt);
    setMessages(fresh.rows);
    setHasMoreOlder(fresh.hasMore);
    scrollToBottom(false);
  };

  /** Infinite scroll: tải thêm tin cũ khi kéo gần đỉnh khung chat. */
  const loadOlderMessages = async () => {
    if (!me || !activeChat) return;
    if (loadingOlderRef.current || !hasMoreOlder) return;
    const oldest = messages[0]?.created_at;
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const clearedAt = clearedMapRef.current[activeChat] ?? 0;
      const older = await fetchOlderPage(me.id, activeChat, clearedAt, oldest as string);
      if (older.rows.length) {
        setMessages((cur) => {
          const seen = new Set(cur.map((m) => m.id));
          const merged = [...older.rows.filter((m) => !seen.has(m.id)), ...cur];
          setCachedMessages(me.id, activeChat, merged, older.hasMore);
          return merged;
        });
        // Giữ nguyên vị trí đọc sau khi chèn tin cũ lên đầu.
        requestAnimationFrame(() => {
          const cur = scrollRef.current;
          if (cur) cur.scrollTop = cur.scrollHeight - prevHeight;
        });
      }
      setHasMoreOlder(older.hasMore && older.rows.length > 0);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };


  const openChat = async (partnerId: string) => {
    // Nạp mốc cleared_at TRƯỚC (cache/dedupe) — mở từ Hồ sơ → Nhắn tin không
    // bao giờ dựng lại tin cũ do map chưa kịp load.
    if (me?.id) {
      const clears = await ensureClearsMap(me.id);
      clearedMapRef.current = { ...clears, ...clearedMapRef.current };
      setClearedMap((prev) => ({ ...clears, ...prev }));
    }
    // KHÔNG gỡ mốc cleared_at khi mở chat từ Hồ sơ / Search / Deep Link.
    // loadMessages sẽ lọc theo cleared_at → user không nhìn thấy tin nhắn cũ.
    // Chỉ tin nhắn mới do partner gửi sau mốc mới được hiển thị.

    setActiveChat(partnerId);
    setNotMatched(false);
    // Reset rồi load quan hệ chặn 2 chiều
    setBlockedRel({ iBlocked: false, theyBlocked: false });
    // Match gate: CHỈ khoá chat khi cuộc trò chuyện này được khởi tạo
    // từ flow FWB (có dòng trong `connection_requests` giữa 2 user)
    // và trạng thái KHÔNG phải 'accepted'.
    // Các chat thường (từ feed, comment, bạn bè, profile) KHÔNG bị khoá.
    // PERF: các truy vấn dưới đây độc lập nhau → chạy song song thay vì tuần tự.
    // Logic/kết quả giữ nguyên 100%, chỉ khác thứ tự thực thi mạng.
    const matchGateTask = (async () => {
      if (!me?.id) return;
      try {
        const { data: partnerMeta } = await supabase
          .from("profiles" as any)
          .select("is_virtual")
          .eq("id", partnerId)
          .maybeSingle();
        const isVirtual = !!(partnerMeta as any)?.is_virtual;
        if (!isVirtual) {
          // Có request FWB giữa 2 bên?
          const { data: req } = await (supabase as any)
            .from("connection_requests")
            .select("status")
            .or(
              `and(from_user.eq.${me.id},to_user.eq.${partnerId}),and(from_user.eq.${partnerId},to_user.eq.${me.id})`,
            )
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          // Chỉ khoá khi có request FWB và chưa accepted
          if (req && req.status !== "accepted") {
            setNotMatched(true);
          }
        }
      } catch { /* ignore — không khoá khi lỗi để tránh khoá nhầm */ }
    })();

    const blockTask = (async () => {
      if (!me?.id) return;
      const { data: blockRows } = await supabase
        .from("user_blocks" as any)
        .select("blocker_id, target_id")
        .or(
          `and(blocker_id.eq.${me.id},target_id.eq.${partnerId}),and(blocker_id.eq.${partnerId},target_id.eq.${me.id})`,
        );
      const rows = (blockRows as any[]) || [];
      setBlockedRel({
        iBlocked: rows.some((r) => r.blocker_id === me.id),
        theyBlocked: rows.some((r) => r.blocker_id === partnerId),
      });
    })();

    // Hiển thị TÊN + AVATAR đối phương NGAY (0s): ưu tiên cache hồ sơ / hàng
    // trong danh sách chat, không để rơi vào fallback "Người dùng".
    const seed =
      peekProfile(partnerId, CHAT_PARTNER_PROFILE_COLS)
      || (chatList.find((i) => i.kind === "dm" && i.partnerId === partnerId) as any)?.profile
      || null;
    if (seed) {
      setActivePartner(seed as Partial<Profile>);
      setActiveName(seed.full_name || seed.display_name || seed.username || "");
    } else {
      setActiveName("");
    }

    const profileTask = (async () => {
      // Explicit column list (verified against DB schema) instead of select("*").
      // Egress: qua profile-cache (TTL 5 phút) → mở lại cùng 1 hội thoại
      // trong phiên sẽ không query profiles lần nữa.
      const profile = await fetchProfileById(partnerId, CHAT_PARTNER_PROFILE_COLS).catch((e) => {
        console.warn("[chat] load partner profile failed", e);
        return null;
      });
      if (profile) setActivePartner(profile as Partial<Profile>);
      const nextName =
        (profile as any)?.full_name
        || (profile as any)?.display_name
        || (profile as any)?.username
        || "";
      if (nextName) setActiveName(nextName);
    })();

    // Tin nhắn là thứ người dùng chờ → cache-first (hiện ngay) + refresh nền.
    const messagesTask = loadMessages(partnerId, { instant: true });

    await Promise.all([messagesTask, profileTask, blockTask, matchGateTask]);

    // Đánh dấu đã đọc — bỏ qua nếu cột is_read không tồn tại trong schema.
    try {
      await (chatDb().from("messages") as any)
        .update({ is_read: true })
        .eq("sender_id", partnerId)
        .eq("receiver_id", me?.id ?? "")
        .eq("is_read", false);
    } catch { /* ignore — schema có thể chưa có cột is_read */ }
    void loadChatList();
  };


  useEffect(() => {
    if (targetUserId) {
      void openChat(targetUserId);
    } else {
      void loadChatList();
    }
  }, [targetUserId, me?.id]);

  // Mỗi khi messages thay đổi (mở chat, gửi, nhận realtime) → cuộn xuống đáy.
  // Bỏ qua khi vừa chèn tin CŨ lên đầu (infinite scroll).
  useEffect(() => {
    if (!activeChat) return;
    if (loadingOlderRef.current) return;
    scrollToBottom(false);
  }, [messages.length, activeChat]);


  useEffect(() => {
    if (!me) return;
    const channel = chatDb()
      .channel("messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const next = payload.new as MessageRecord;
        if (hiddenMessageIds(me.id).has(String(next.id))) return;
        // Lọc deleted_by_users: tin mình đã "xoá phía tôi" (từ thiết bị khác)
        // không bao giờ được hiện lại qua realtime.
        const delBy = (next as any)?.deleted_by_users;
        if (Array.isArray(delBy) && delBy.includes(me.id)) return;
        // Lọc theo cleared_at: nếu tin nhắn có created_at <= cleared_at với
        // partner tương ứng → bỏ qua (đây là edge-case rất hiếm: replay/insert
        // với timestamp trong quá khứ). Tin nhắn realtime bình thường luôn > cleared_at.
        const partnerId =
          next.sender_id === me.id ? (next.receiver_id as string) : (next.sender_id as string);
        const clearedAt = clearedMapRef.current[partnerId] ?? 0;
        const msgTs = new Date(next.created_at ?? Date.now()).getTime();
        if (clearedAt > 0 && msgTs <= clearedAt) return;

        // Tin nhắn hợp lệ sau mốc clear → refresh list để conversation hiện lại.
        const active = activeChatRef.current;
        if (!active) {
          void loadChatList();
          return;
        }
        const matched =
          (next.sender_id === me.id && next.receiver_id === active) ||
          (next.sender_id === active && next.receiver_id === me.id);
        if (matched) {
          setMessages((current) => {
            if (current.some((m) => m.id === next.id)) return current;
            const merged = [...current, next];
            if (me?.id && active) setCachedMessages(me.id, active, merged, hasMoreOlderRef.current);
            return merged;
          });
          scrollToBottom();
        } else {
          // Cập nhật list khi có tin nhắn mới ở conversation khác.
          void loadChatList();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const next = payload.new as MessageRecord;
        const delBy = (next as any)?.deleted_by_users;
        if (Array.isArray(delBy) && me?.id && delBy.includes(me.id)) {
          // Thiết bị khác vừa "xoá phía tôi" → ẩn luôn ở đây, bền vững.
          hideMessagesForMe(me.id, [String(next.id)]);
          setHiddenMsgIds(new Set(hiddenMessageIds(me.id)));
          setMessages((current) => current.filter((m) => m.id !== next.id));
          return;
        }
        setMessages((current) => current.map((m) => (m.id === next.id ? { ...m, ...next } : m)));
        // Thu hồi / chỉnh sửa → cập nhật ngay preview trong danh sách chat.
        setChatList((cur) =>
          cur.map((it) =>
            it.kind === "dm" && it.lastMessage?.id === next.id
              ? { ...it, lastMessage: { ...it.lastMessage, ...next } }
              : it,
          ),
        );
      })
      .subscribe();

    return () => {
      void chatDb().removeChannel(channel);
    };
  }, [me?.id]);

  // Gift escrow realtime removed with Chat gift UI.

  // Legacy "chat:reveal" event từ Notification banner — chỉ cần refresh list;
  // conversation sẽ tự hiện khi có message > cleared_at.
  useEffect(() => {
    const handler = () => { void loadChatList(); };
    window.addEventListener("chat:reveal", handler as EventListener);
    return () => window.removeEventListener("chat:reveal", handler as EventListener);
  }, [me?.id]);


  const sendingRef = useRef(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const [sending, setSending] = useState(false);
  /** Sao chép nội dung tin nhắn. */
  const copyMessage = async (message: MessageRecord) => {
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      showToast("Đã sao chép");
    } catch {
      showToast("Không sao chép được");
    }
  };
  // ---- Voice Chat V1 state
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showVoiceLib, setShowVoiceLib] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);

  // ---- Tin nhắn đang chờ (Message Request): giới hạn 2 tin khi chưa chấp nhận.
  const requestState = useMemo(
    () => computeRequestState(messages as any[], me?.id ?? null, activeChat),
    [messages, me?.id, activeChat],
  );

  const sendMessage = async (override?: string) => {
    // (voice dùng chung đường gửi này qua marker [voice:path|dur])
    const draft = (override ?? text).trim();
    if (!me || !activeChat || !draft) return;
    if (voiceUploading) return;
    if (sendingRef.current) return;
    if (requestState.locked && !isAcceptSystemMessage(draft)) {
      alert(PENDING_LOCKED_TEXT);
      return;
    }
    // Restriction gate — messaging may be blocked by admin.
    {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("message"))) return;
    }

    sendingRef.current = true;
    setSending(true);
    const content = draft;
    const replySnapshot = replyTo;
    const partnerSnapshot = activeChat;
    const isVirtual = Boolean((activePartner as any)?.is_virtual);

    try {
      // Chặn 2 chiều: nếu mình đã chặn họ HOẶC họ đã chặn mình → không cho gửi.
      const { data: blockRows } = await supabase
        .from("user_blocks" as any)
        .select("blocker_id, target_id")
        .or(
          `and(blocker_id.eq.${me.id},target_id.eq.${activeChat}),and(blocker_id.eq.${activeChat},target_id.eq.${me.id})`,
        );
      if (blockRows && blockRows.length > 0) {
        const iBlocked = (blockRows as any[]).some((r) => r.blocker_id === me.id);
        alert(
          iBlocked
            ? "Bạn đã chặn người này. Hãy gỡ chặn trong Trang cá nhân → Đã chặn để gửi tin."
            : "Không thể gửi tin nhắn đến người dùng này.",
        );
        return;
      }

      // ===== OPTIMISTIC: prepend temp message ngay để UI phản hồi tức thì.
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempMsg: MessageRecord = {
        id: tempId,
        sender_id: me.id,
        receiver_id: partnerSnapshot,
        content,
        image_url: null,
        is_read: false,
        created_at: new Date().toISOString(),
        reply_to: replySnapshot?.id ?? null,
      };
      setMessages((cur) => [...cur, tempMsg]);
      if (!override) setText("");
      setReplyTo(null);
      scrollToBottom(true);

      try {
        if (isVirtual) {
          await sendVirtualMessage(partnerSnapshot, me.id, content, replySnapshot?.id ?? null);
        } else {
          await createMessageCompat(me.id, partnerSnapshot, content, null, replySnapshot?.id ?? null);
        }
        // Success: remove temp trước khi load để tránh nháy (loadMessages ghi đè array).
        setMessages((cur) => cur.filter((m) => m.id !== tempId));
        await loadMessages(partnerSnapshot);
        void loadChatList();
      } catch (error: any) {
        // Rollback: gỡ temp + khôi phục input để user gửi lại.
        setMessages((cur) => cur.filter((m) => m.id !== tempId));
        setText(content);
        setReplyTo(replySnapshot);

        // Hạn chế (guard phía client hoặc trigger database) → popup + toast riêng.
        {
          const { handleRestrictionError } = await import("@/lib/restriction-guard");
          if (await handleRestrictionError(error)) return;
        }
        const { toUserMessage } = await import("@/lib/user-error");
        const { MODERATION_MESSAGE } = await import("@/lib/keyword-filter");
        const friendly = toUserMessage(error, "Không gửi được tin nhắn, vui lòng thử lại.");

        console.error("[sendMessage] failed:", {
          error,
          code: error?.code,
          sender_id: me.id,
          receiver_id: partnerSnapshot,
          is_virtual: isVirtual,
        });
        alert(friendly === MODERATION_MESSAGE ? friendly : `${friendly}`);

      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // Danh sách inbox đã lọc — PHẢI khai báo trước mọi early return để số lượng
  // và thứ tự Hooks không đổi giữa các lần render (tab Tin nhắn / Nhóm).
  const filteredList = useMemo(() => {
    const term = inboxSearch.trim().toLowerCase();
    const tabbed = chatList.filter((it) => it.kind === inboxTab);
    if (!term) {
      return [...tabbed].sort((a, b) => {
        const aId = a.kind === "dm" ? a.partnerId : `g:${a.groupId}`;
        const bId = b.kind === "dm" ? b.partnerId : `g:${b.groupId}`;
        const aPin = pinnedIds.has(aId) ? 1 : 0;
        const bPin = pinnedIds.has(bId) ? 1 : 0;
        if (aPin !== bPin) return bPin - aPin;
        return b.sortTs - a.sortTs;
      });
    }
    return tabbed
      .filter((it) => {
        if (it.kind === "group") return it.name.toLowerCase().includes(term);
        const name = resolveUserName(it.profile as any, "").toLowerCase();
        const pid = (it.profile?.public_id ?? "").toLowerCase();
        return name.includes(term) || pid.includes(term);
      })
      .sort((a, b) => b.sortTs - a.sortTs);
  }, [chatList, inboxTab, inboxSearch, pinnedIds]);

  if (activeGroupId) {

    return <GroupChatPage groupId={activeGroupId} onBack={() => { setActiveGroupId(null); void loadChatList(); }} />;
  }

  if (activeChat) {
    // Media VIP sau tên do <CloneVipNameMedia /> tự nạp từ profiles.vip_media.
    // Trạng thái "Đã xem" chỉ hiển thị ở tin nhắn cuối cùng do mình gửi.
    const lastSelfMessageId = (() => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.sender_id === me?.id && !hiddenMsgIds.has(m.id)) return m.id;
      }
      return null;
    })();

    return (
      <section className="chat-fixed">
        <div className="chat-fixed-header chat-fixed-header--minimal">
          <button className="icon-button" onClick={() => { setActiveChat(null); setActiveName(""); setActivePartner(null); void loadChatList(); }}>
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            className="chat-fixed-titlewrap"
            onClick={() => onOpenProfile(activeChat)}
          >
            <span className="chat-fixed-avatar-wrap">
              <AvatarGlow
                avatar={activePartner?.avatar ?? null}
                userId={activeChat}
                size={48}
                alt={title}
                imgClassName="bubble-avatar"
              />
              <PresenceDot
                userId={activeChat}
                lastSeen={(activePartner as any)?.last_seen}
                isVirtual={(activePartner as any)?.is_virtual}
              />
            </span>
            <span className="chat-fixed-titletext">
              <span className="chat-fixed-name">
                {title}
                {/* HỆ THỐNG 2: Media VIP dán ngay sát tên trong tin nhắn. */}
                

              </span>
              {peerViewing ? (
                <span className="chat-fixed-status chat-status-viewing">🟢 Đang xem</span>
              ) : (
                <PresenceStatus
                  userId={activeChat}
                  lastSeen={(activePartner as any)?.last_seen}
                  isVirtual={(activePartner as any)?.is_virtual}
                />
              )}
            </span>
          </button>
          <span className="tg-header-actions">
            <button
              className="icon-button chat-call-btn"
              aria-label="Gọi thoại"
              title="Gọi thoại"
              onClick={() => setCallNotice("voice")}
            >
              <Phone size={18} />
            </button>
            <button
              className="icon-button chat-call-btn"
              aria-label="Gọi video"
              title="Gọi video"
              onClick={() => setCallNotice("video")}
            >
              <Video size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Tuỳ chọn"
              onClick={() => setShowMenu(true)}
            >
              <MoreVertical size={18} />
            </button>
          </span>
        </div>

        <VipUnlockModal
          open={!!callNotice}
          variant={callNotice === "video" ? "video" : "voice"}
          onClose={() => setCallNotice(null)}
        />



        <div
          ref={scrollRef}
          className="chat-fixed-scroll"
          onScroll={(e) => {
            // Infinite scroll: gần đỉnh → tải thêm tin cũ (không polling).
            if (e.currentTarget.scrollTop <= 80) void loadOlderMessages();
          }}
        >
          {hasMoreOlder ? (
            <div style={{ textAlign: "center", padding: "6px 0", fontSize: 12, opacity: 0.6 }}>
              {loadingOlder ? "Đang tải tin nhắn cũ…" : "Kéo lên để xem tin nhắn cũ"}
            </div>
          ) : null}
          {messages.length === 0 ? <div className="empty-state">Bắt đầu cuộc trò chuyện đầu tiên.</div> : null}
          {messages.filter((m) => !hiddenMsgIds.has(m.id)).map((message, idx, visibleMsgs) => {
            const prev = visibleMsgs[idx - 1];
            if (isAcceptSystemMessage(message.content)) {
              return (
                <div key={message.id} className="chat-time-divider" aria-live="polite">
                  <span>{acceptSystemText(message.content)}</span>
                </div>
              );
            }
            const isSelf = message.sender_id === me?.id;
            const curTs = new Date(message.created_at ?? 0).getTime();
            const prevTs = prev ? new Date(prev.created_at ?? 0).getTime() : 0;
            const gapMs = prev ? curTs - prevTs : Infinity;
            // Messenger-style: chèn mốc thời gian khi cách nhau đủ lâu (~10 phút),
            // hoặc ở đầu cuộc trò chuyện.
            const showDateDivider = !prev || gapMs >= 10 * 60_000;
            const sameSenderAsPrev = prev && prev.sender_id === message.sender_id
              && (curTs - prevTs < 5 * 60_000);
            const showHeader = !sameSenderAsPrev || showDateDivider;
            const showInlineTime = timeVisibleId === message.id;

            const sender: Partial<Profile> | null = isSelf ? (me as any) : (activePartner as any);
            // Anti Clone: đối phương bị khóa → tin nhắn cũ vẫn còn, nhưng hiển thị
            // "Tài khoản bị khóa" và không mở được hồ sơ.
            const senderLocked = !isSelf && isLockedAccount(sender as any);
            const senderName = senderLocked
              ? LOCKED_USER_NAME
              : sender?.full_name
              || (sender as any)?.display_name
              || sender?.username
              || (isSelf
                ? "Bạn"
                : ((activePartner as any)?.full_name
                  || (activePartner as any)?.display_name
                  || (activePartner as any)?.username
                  || "Đang tải…"));
            const senderAvatar = sender?.avatar || "/placeholder.svg";
            const senderVip = (sender?.vip_level as number) || 1;
            const senderArea = sender?.location || sender?.province || "";
            const senderId = isSelf ? me?.id : activeChat;
            const dividerStr = formatDivider(message.created_at);
            const openProfile = () => { if (!senderLocked && senderId) onOpenProfile(senderId); };

            const replyTarget = message.reply_to
              ? messages.find((m) => m.id === message.reply_to) ?? null
              : null;
            const replyTargetName = replyTarget
              ? replyTarget.sender_id === me?.id
                ? "Bạn"
                : (activePartner as any)?.full_name || (activePartner as any)?.username || "Người dùng"
              : "";

            return (
              <div key={message.id} id={`message-${message.id}`}>
                {showDateDivider ? (
                  <div className="chat-time-divider" aria-hidden>
                    <span>{dividerStr}</span>
                  </div>
                ) : null}
                <MessageGesture
                  isSelf={isSelf}
                  onMenu={() => { setMsgMenu({ message, isSelf }); }}
                >
                <div className={`bubble-row bubble-row-luxe ${isSelf ? "is-self" : ""} ${showHeader ? "" : "is-grouped"}`}>
                {!isSelf ? (
                  showHeader ? (
                    <button type="button" className="bubble-avatar-btn" onClick={openProfile} aria-label={`Mở hồ sơ ${senderName}`}>
                      <AvatarGlow
                        avatar={senderAvatar}
                        userId={senderId ?? null}
                        size={32}
                        alt={senderName}
                        imgClassName="bubble-avatar"
                      />
                    </button>
                  ) : (
                    <span className="bubble-avatar-spacer" aria-hidden />
                  )
                ) : null}
                <div
                  className="bubble-stack"
                  style={{
                    alignItems: isSelf ? "flex-end" : "flex-start",
                    width: "fit-content",
                    maxWidth: "70%",
                    minWidth: 0,
                  }}
                >
                  {showHeader ? (
                    <div className="bubble-header-luxe">
                      <button type="button" className="bubble-name-btn" onClick={openProfile} disabled={senderLocked}>{senderName}</button>
                      <UniversalBadge profile={sender as any} />
                    </div>
                  ) : null}
                  {replyTarget ? (
                    <div
                      className={`chat-reply-quote${flashReplyId === replyTarget.id ? " is-flash" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); scrollToMessage(replyTarget.id); }}
                    >
                      <span className="chat-reply-quote-name">{replyTargetName}</span>
                      <span className="chat-reply-quote-text">{replyTarget.content}</span>
                    </div>
                  ) : null}
                  <div
                    className="flex flex-row items-start gap-1"
                    style={{ flexDirection: isSelf ? "row-reverse" : "row", width: "fit-content", maxWidth: "100%" }}
                  >
                    {showInlineTime ? (
                      <span className="chat-inline-time" aria-hidden>{dividerStr}</span>
                    ) : null}
                    <div
                      className={`chat-bubble !w-fit !max-w-full !inline-block whitespace-pre-wrap break-words${message.is_recalled ? " is-recalled" : ""}`}
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        width: "fit-content",
                        maxWidth: "100%",
                        minWidth: 0,
                        display: "inline-block",
                        textAlign: "left",
                        opacity: message.is_recalled ? 0.7 : 1,
                        fontStyle: message.is_recalled ? "italic" : "normal",
                      }}
                    >
                      {editingMsg?.id === message.id ? (
                        <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
                          <textarea
                            value={editingMsg.text}
                            onChange={(e) => setEditingMsg({ id: message.id, text: e.target.value })}
                            rows={2}
                            autoFocus
                            style={{
                              width: "100%",
                              resize: "vertical",
                              border: "1px solid rgba(0,0,0,0.15)",
                              borderRadius: 10,
                              padding: "8px 10px",
                              fontSize: 14,
                              fontFamily: "inherit",
                              background: "#fff",
                              color: "#111",
                            }}
                          />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="chat-edit-cancel"
                              onClick={() => setEditingMsg(null)}
                              style={{ border: "none", background: "rgba(0,0,0,0.06)", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              className="chat-edit-save"
                              onClick={async () => {
                                const newText = editingMsg.text.trim();
                                if (!newText || newText === (message.content ?? "")) { setEditingMsg(null); return; }
                                const prevContent = message.content;
                                setMessages((cur) => cur.map((m) => m.id === message.id ? { ...m, content: newText, edited_at: new Date().toISOString() } : m));
                                setEditingMsg(null);
                                const { error } = await (chatDb().from("messages") as any)
                                  .update({ content: newText, edited_at: new Date().toISOString() })
                                  .eq("id", message.id);
                                if (error) {
                                  setMessages((cur) => cur.map((m) => m.id === message.id ? { ...m, content: prevContent } : m));
                                  showToast("Không thể chỉnh sửa: " + error.message);
                                }
                              }}
                              style={{ border: "none", background: "linear-gradient(135deg,#a855f7,#ff5b8a)", color: "#fff", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                            >
                              Lưu
                            </button>
                          </div>
                        </div>
                      ) : message.is_recalled ? (
                        <span className="chat-bubble-text" key={`recalled-${message.id}`} style={{ color: "hsl(var(--muted-foreground))" }}>
                          {isSelf ? "Bạn đã thu hồi một tin nhắn" : "Đã thu hồi một tin nhắn"}
                        </span>
                      ) : (
                        <>
                          {parseVoiceMarker(message.content) ? (
                            <VoiceBubble
                              path={parseVoiceMarker(message.content)!.path}
                              duration={parseVoiceMarker(message.content)!.duration}
                              isSelf={isSelf}
                            />
                          ) : (
                            <span className="chat-bubble-text" key={`content-${message.id}`}><RichText text={message.content} gifContext="message" /></span>
                          )}
                          {message.edited_at ? (
                            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65, fontStyle: "italic" }}>(đã chỉnh sửa)</span>
                          ) : null}
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="bubble-menu-btn"
                      aria-label="Tuỳ chọn tin nhắn"
                      onClick={(e) => { e.stopPropagation(); setMsgMenu({ message, isSelf }); }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                  {(reactionsByMessage.get(message.id)?.length ?? 0) > 0 ? (
                    <div
                      className="bubble-reactions-row"
                      style={{
                        alignSelf: isSelf ? "flex-end" : "flex-start",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 2,
                      }}
                    >
                      {reactionsByMessage.get(message.id)!.map((b) => (
                        <button
                          key={b.emoji}
                          type="button"
                          className={`bubble-reactions${b.mine ? " is-mine" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionViewerMsgId(message.id);
                          }}
                          aria-label={`${b.count} người thả ${b.emoji}. Bấm để xem chi tiết.`}
                        >
                          <span>{b.emoji}</span>
                          <span className="count">{b.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {isSelf ? (
                  showHeader ? (
                    <button type="button" className="bubble-avatar-btn" onClick={openProfile} aria-label="Mở hồ sơ của bạn">
                      <AvatarGlow
                        avatar={senderAvatar}
                        userId={senderId ?? null}
                        size={32}
                        alt={senderName}
                        imgClassName="bubble-avatar"
                      />
                    </button>
                  ) : (
                    <span className="bubble-avatar-spacer" aria-hidden />
                  )
                ) : null}
                </div>
                </MessageGesture>
                {isSelf && message.id === lastSelfMessageId ? (
                  <div className="chat-read-receipt" aria-live="polite">
                    {peerViewing
                      ? <span className="is-viewing">🟢 Đang xem</span>
                      : (message as any).is_read
                        ? <span className="is-seen">✓✓ Đã xem</span>
                        : <span className="is-sent">✓ Chưa xem</span>}
                  </div>
                ) : null}
              </div>
            );
          })}
          {peerTyping ? (
            <div className="chat-typing-row" aria-live="polite">
              <span className="chat-typing-bubble" aria-label="Đang nhập">
                <span /><span /><span />
              </span>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>


        {(() => {
          const partnerInactive =
            (activePartner as any)?.seed_status === "inactive" ||
            ((activePartner as any)?.is_virtual && (activePartner as any)?.is_active === false);
          // OVERLAY "cần được đối phương chấp nhận kết nối" đã được GỠ HOÀN TOÀN.
          if (blockedRel.iBlocked || blockedRel.theyBlocked) {

            return (
              <div
                className="chat-fixed-composer"
                style={{
                  justifyContent: "center",
                  background: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "14px 16px",
                  textAlign: "center",
                }}
              >
                🚫 Bạn không thể gửi tin nhắn cho người này
              </div>
            );
          }
          if (partnerInactive) {
            return (
              <div
                className="chat-fixed-composer"
                style={{
                  justifyContent: "center",
                  background: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "14px 16px",
                  textAlign: "center",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div>💤 Tài khoản đã ngừng hoạt động</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>Lịch sử trò chuyện vẫn được giữ lại.</div>
              </div>
            );
          }
          if (requestState.showAccept) {
            const myName =
              (me as any)?.full_name || (me as any)?.username || "Người dùng";
            return (
              <div
                className="chat-fixed-composer"
                style={{ flexDirection: "column", gap: 8, padding: "12px 16px", textAlign: "center" }}
              >
                <div className="text-xs text-slate-300">
                  Đây là tin nhắn đang chờ. Chấp nhận để trò chuyện không giới hạn.
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg bg-primary text-white font-medium py-2.5 px-4 hover:opacity-90 transition-opacity disabled:opacity-50"
                  disabled={sending}
                  onClick={() => void sendMessage(acceptSystemContent(myName))}
                >
                  Chấp nhận trò chuyện
                </button>
              </div>
            );
          }
          if (requestState.locked) {
            return (
              <div
                className="chat-fixed-composer"
                style={{
                  justifyContent: "center",
                  background: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "14px 16px",
                  textAlign: "center",
                }}
              >
                {PENDING_LOCKED_TEXT}
              </div>
            );
          }
          return (
            <>
            <div className="chat-fixed-composer">
              {replyTo ? (
                <div className="chat-reply-preview">
                  <div className="chat-reply-preview-body">
                    <span className="chat-reply-preview-name">
                      Trả lời {replyTo.sender_id === me?.id ? "chính bạn" : (title || "người này")}
                    </span>
                    <span className="chat-reply-preview-text">{replyTo.content}</span>
                  </div>
                  <button className="chat-reply-preview-close" onClick={() => setReplyTo(null)} aria-label="Huỷ trả lời">
                    <X size={16} />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="chat-composer-icon-btn"
                onClick={() => setShowVoiceRecorder(true)}
                aria-label="Gửi tin nhắn thoại"
                title="Tin nhắn thoại"
              >
                <Mic size={20} />
              </button>
              {(me as any)?.is_admin ? (
                <button
                  type="button"
                  className="chat-composer-icon-btn"
                  onClick={() => setShowVoiceLib(true)}
                  aria-label="Thư viện voice"
                  title="🎙 Gửi Voice từ thư viện"
                >
                  <Library size={20} />
                </button>
              ) : null}
              {showVoiceRecorder ? (
                <VoiceRecorder
                  sending={voiceUploading}
                  onCancel={() => setShowVoiceRecorder(false)}
                  onSend={async (blob, duration) => {
                    if (!me) return;
                    // Kiểm tra VIP CHỈ khi bấm Gửi — không VIP thì không upload gì.
                    if (!canSendVoice(me)) {
                      setShowVoiceRecorder(false);
                      setVoiceLocked(true);
                      return;
                    }
                    setVoiceUploading(true);
                    try {
                      const path = await uploadVoiceBlob(me.id, blob);
                      setShowVoiceRecorder(false);
                      await sendMessage(voiceToken(path, duration));
                    } catch (e: any) {
                      alert(e?.message || "Không gửi được tin nhắn thoại");
                    } finally {
                      setVoiceUploading(false);
                    }
                  }}
                />
              ) : (
              <input
                className="app-input chat-input-luxe"
                value={text}
                onChange={(event) => { setText(event.target.value); sendTypingSignal(); }}
                placeholder="Nhập tin nhắn..."
                onKeyDown={(event) => event.key === "Enter" && !sending && void sendMessage()}
              />
              )}
              <button
                ref={gifBtnRef}
                type="button"
                className={`chat-composer-icon-btn${showGifPicker ? " is-active" : ""}`}
                onClick={() => setShowGifPicker((v) => !v)}
                aria-label="Chèn GIF hoặc sticker"
                title="GIF / Sticker"
              >
                <Sparkles size={20} />
              </button>
              <GifPicker
                open={showGifPicker}
                onClose={() => setShowGifPicker(false)}
                anchorRef={gifBtnRef}
                onPick={(url) => {
                  setShowGifPicker(false);
                  void sendMessage(gifToken(url));
                }}
              />
              <button className="icon-button chat-send-luxe" onClick={() => void sendMessage()} aria-label="Gửi tin nhắn" disabled={sending || !text.trim()}>
                <Send size={16} />
              </button>
              <VoiceLibraryPicker
                open={showVoiceLib}
                onClose={() => setShowVoiceLib(false)}
                onPick={(item) => {
                  setShowVoiceLib(false);
                  void sendMessage(voiceToken(item.storage_path, item.duration));
                }}
              />
              <ZaloVipLockModal
                open={voiceLocked}
                title="Tin nhắn thoại dành cho thành viên VIP"
                message={voiceVipLockMessage(me)}
                onClose={() => setVoiceLocked(false)}
              />
            </div>
            {requestState.note ? (
              <div
                style={{
                  padding: "6px 16px 10px",
                  fontSize: 12,
                  lineHeight: 1.4,
                  textAlign: "center",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                {requestState.note}
              </div>
            ) : null}
            </>
          );
        })()}

        {showMenu ? (
          <div className="tg-sheet-backdrop" onClick={() => setShowMenu(false)}>
            <div className="tg-sheet" onClick={(e) => e.stopPropagation()}>
              <button className="tg-sheet-item" onClick={() => { setShowMenu(false); setCallNotice("voice"); }}>
                <span className="tg-icon"><Phone size={18} /></span> Gọi thoại
              </button>
              <button className="tg-sheet-item" onClick={() => { setShowMenu(false); setCallNotice("video"); }}>
                <span className="tg-icon"><Video size={18} /></span> Gọi video
              </button>
              <button className="tg-sheet-item" onClick={() => { if (activeChat) togglePin(activeChat); setShowMenu(false); }}>
                <span className="tg-icon">{localPinned ? <PinOff size={18} /> : <Pin size={18} />}</span>
                {localPinned ? "Bỏ ghim đoạn chat" : "Ghim đoạn chat"}
              </button>
              <button className="tg-sheet-item" onClick={() => { if (activeChat) toggleMute(activeChat); setShowMenu(false); }}>
                <span className="tg-icon">{localMuted ? <BellRing size={18} /> : <BellOff size={18} />}</span>
                {localMuted ? "Bật thông báo" : "Tắt thông báo"}
              </button>
              <button
                className="tg-sheet-item is-danger"
                onClick={() => {
                  setShowMenu(false);
                  if (activeChat) setConfirmDelete({ id: activeChat, name: activeName || "người này" });
                }}
              >
                <span className="tg-icon"><Trash2 size={18} /></span> Xoá cuộc trò chuyện
              </button>
            </div>
            <button className="tg-sheet-cancel" onClick={() => setShowMenu(false)}>Huỷ</button>
          </div>
        ) : null}

        {toastMsg ? <div className="tg-toast" key={toastMsg + Date.now()}>{toastMsg}</div> : null}

        {msgMenu ? (
          <div className="mfx-overlay" onClick={() => setMsgMenu(null)} role="dialog" aria-modal="true">
            {/* Nền mờ + phóng to tin nhắn được chọn + thanh cảm xúc phía trên */}
            <div className="mfx-focus" onClick={(e) => e.stopPropagation()}>
              <div className="mfx-reactions" role="group" aria-label="Cảm xúc">
                {REACTIONS.map((emoji) => {
                  const picked = myReactionByMessage[msgMenu.message.id] === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`mfx-reaction${picked ? " is-picked" : ""}`}
                      onClick={() => { void toggleReaction(msgMenu.message.id, emoji); setMsgMenu(null); }}
                      aria-label={`Thả cảm xúc ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <div className={`mfx-bubble${msgMenu.isSelf ? " is-self" : ""}`}>
                {getMessagePreview(msgMenu.message, msgMenu.isSelf)}
              </div>
              <div className="mfx-time">{formatDivider(msgMenu.message.created_at)}</div>
            </div>

            <div className="cx-sheet" onClick={(e) => e.stopPropagation()}>
              {isVoiceMessage(msgMenu.message.content) ? null : (
                <button className="cx-sheet-item" onClick={() => { void copyMessage(msgMenu.message); setMsgMenu(null); }}>
                  <Copy size={18} /> Sao chép
                </button>
              )}
              <button
                className="cx-sheet-item"
                onClick={() => { const id = msgMenu.message.id; setMsgMenu(null); setTimeVisibleId(id); }}
              >
                <Clock size={18} /> Xem thời gian
              </button>
              <button
                className="cx-sheet-item is-danger"
                onClick={() => {
                  const target = msgMenu.message;
                  setMsgMenu(null);
                  deleteForMe(target);
                }}
              >
                <Trash2 size={18} /> Xoá phía tôi
              </button>
              {msgMenu.isSelf && !msgMenu.message.is_recalled ? (
                <>
                  {(() => {
                    const raw = msgMenu.message.content ?? "";
                    const stripped = raw.replace(/\[\[gif:[^\]\s]+\]\]/g, "").trim();
                    const isGifOnly = /\[\[gif:[^\]\s]+\]\]/.test(raw) && stripped.length === 0;
                    if (isGifOnly || isVoiceMessage(raw)) return null;
                    return (
                      <button
                        className="cx-sheet-item"
                        onClick={() => {
                          setEditingMsg({ id: msgMenu.message.id, text: msgMenu.message.content ?? "" });
                          setMsgMenu(null);
                        }}
                      >
                        <Pencil size={18} /> Chỉnh sửa
                      </button>
                    );
                  })()}
                  <button
                    className="cx-sheet-item is-danger"
                    onClick={() => {
                      setConfirmRecall({ id: msgMenu.message.id });
                      setMsgMenu(null);
                    }}
                  >
                    <RotateCcw size={18} /> Thu hồi
                  </button>
                </>
              ) : null}
              {msgMenu.isSelf ? null : (
                <>
                  {activeChat ? (
                    <button
                      className="cx-sheet-item is-danger"
                      onClick={() => {
                        setReportTarget({
                          targetId: activeChat,
                          messageId: msgMenu.message.id,
                          text: msgMenu.message.content ?? "",
                        });
                        setMsgMenu(null);
                      }}
                    >
                      <Flag size={18} /> Tố cáo
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <button className="cx-sheet-cancel" onClick={() => setMsgMenu(null)}>Huỷ</button>
          </div>
        ) : null}

        {reactionViewerMsgId ? (
          <ReactionViewer
            messageId={reactionViewerMsgId}
            buckets={reactionsByMessage.get(reactionViewerMsgId) ?? []}
            onClose={() => setReactionViewerMsgId(null)}
          />
        ) : null}

        {reportTarget ? (
          <ReportRewardModal
            open
            onClose={() => setReportTarget(null)}
            targetUid={reportTarget.targetId}
            initialKind="message"
          />
        ) : null}

        {confirmDelete ? (
          <div className="tg-sheet-backdrop" onClick={() => setConfirmDelete(null)} style={{ justifyContent: "center", alignItems: "center" }}>
            <div
              className="tg-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 340, margin: "auto", padding: 20, textAlign: "center" }}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Xoá đoạn chat?</div>
              <div style={{ fontSize: 14, color: "var(--tg-text-muted)", marginBottom: 16 }}>
                Bạn có chắc chắn muốn xoá toàn bộ đoạn chat với <b>{confirmDelete.name}</b> không?
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="tg-sheet-cancel"
                  style={{ flex: 1, padding: 12, borderRadius: 12 }}
                  onClick={() => setConfirmDelete(null)}
                >
                  Huỷ
                </button>
                <button
                  className="tg-sheet-cancel"
                  style={{ flex: 1, padding: 12, borderRadius: 12, color: "#ff3b30", fontWeight: 700 }}
                  onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); void deleteChatLocally(id); }}
                >
                  Xoá
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {confirmRecall ? (
          <div className="tg-sheet-backdrop" onClick={() => setConfirmRecall(null)} style={{ justifyContent: "center", alignItems: "center" }}>
            <div
              className="tg-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 340, margin: "auto", padding: 20, textAlign: "center" }}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Thu hồi tin nhắn?</div>
              <div style={{ fontSize: 14, color: "var(--tg-text-muted)", marginBottom: 16 }}>
                Tin nhắn sẽ bị thu hồi với tất cả mọi người trong cuộc trò chuyện. Bạn không thể hoàn tác thao tác này.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="tg-sheet-cancel" style={{ flex: 1, padding: 12, borderRadius: 12 }} onClick={() => setConfirmRecall(null)}>
                  Huỷ
                </button>
                <button
                  className="tg-sheet-cancel"
                  style={{ flex: 1, padding: 12, borderRadius: 12, color: "#ff3b30", fontWeight: 700 }}
                  onClick={async () => {
                    const id = confirmRecall.id;
                    setConfirmRecall(null);
                    const prev = messages.find((m) => m.id === id);
                    setMessages((cur) => cur.map((m) => m.id === id ? { ...m, is_recalled: true, recalled_at: new Date().toISOString() } : m));
                    const { error } = await (chatDb().from("messages") as any)
                      .update({ is_recalled: true, recalled_at: new Date().toISOString() })
                      .eq("id", id);
                    if (error) {
                      setMessages((cur) => cur.map((m) => m.id === id && prev ? prev : m));
                      showToast("Không thể thu hồi: " + error.message);
                    }
                  }}
                >
                  Thu hồi
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showSearch ? (
          <ChatSearchOverlay
            messages={messages.slice(-30)}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={() => setShowSearch(false)}
            meId={me?.id}
          />
        ) : null}
      </section>
    );
  }

  // === Inbox list view ===
  // Danh sách đã được tính bằng useMemo ở phía trên (trước mọi early return).




  return (
    <section className="stack-md">
      <div className="flex items-center justify-between gap-2 px-1 pt-0.5 pb-1">
        <h2 className="text-lg font-bold tracking-tight">Tin nhắn</h2>
        <MessageResetCountdown inline />
      </div>

      {/* Search + Filter tabs */}
      <div className="px-1 space-y-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={inboxSearch}
            onChange={(e) => setInboxSearch(e.target.value)}
            placeholder="Tìm kiếm thành viên..."
            className="w-full rounded-full border border-border bg-card pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Tìm kiếm thành viên"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setInboxTab("dm");
              setGroupBadgeSeen(false);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              inboxTab === "dm"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Tin nhắn
          </button>
          <button
            type="button"
            onClick={() => {
              setInboxTab("group");
              setGroupBadgeSeen(true);
            }}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              inboxTab === "group"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Nhóm
            {groupBadgeSeen ? null : <HotBadge999 className="absolute -top-1.5 -right-1.5" />}
          </button>
        </div>
      </div>

      {inboxTab === "group" ? (
        <BaitGroupsList
          province={(me as any)?.province || (me as any)?.location || null}
          hideBadges={groupBadgeSeen}
        />
      ) : null}

      {filteredList.length === 0 && inboxTab !== "group" ? (
        <div className="empty-state">Chưa có cuộc trò chuyện nào.</div>
      ) : null}
      {filteredList.map((item) => {
        if (item.kind === "group") {
          const gid = `g:${item.groupId}`;
          const isPinned = pinnedIds.has(gid);
          return (
            <button
              key={`g-${item.groupId}`}
              className="chat-list-row active:scale-[0.98] transition-all duration-150"
              onClick={() => setActiveGroupId(item.groupId)}
              onContextMenu={(e) => { e.preventDefault(); setConvMenu({ id: gid, name: item.name, kind: "group" }); }}
              {...longPressProps(() => setConvMenu({ id: gid, name: item.name, kind: "group" }))}
            >
              <span className="chat-list-avatar-wrap">
                <span
                  className="chat-list-avatar grid place-items-center"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", color: "white" }}
                  aria-hidden
                >
                  <Users size={18} />
                </span>
              </span>
              <div className="chat-list-body">
                <div className="chat-list-row1">
                  <span className="chat-list-name inline-flex items-center gap-1.5">
                    {item.name}
                    <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-violet-500/15 text-violet-700 border border-violet-300/40">
                      NHÓM
                    </span>
                  </span>
                  <span className="chat-list-time inline-flex items-center gap-1">
                    {isPinned ? <Pin size={11} className="opacity-70" /> : null}
                    {formatChatListTime(new Date(item.sortTs))}
                  </span>
                </div>
                <div className="chat-list-row2">
                  <span className="chat-list-preview">
                    {item.lastSenderId === me?.id ? <span className="chat-list-prefix">Bạn: </span> : null}
                    {item.lastPreview}
                  </span>
                </div>
              </div>
            </button>
          );
        }

        const lastTs = item.lastMessage?.created_at;
        const isSelfLast = item.lastMessage?.sender_id === me?.id;
        const preview = item.lastMessage
          ? previewForMessage(item.lastMessage, isSelfLast)
          : "Bắt đầu cuộc trò chuyện đầu tiên";

        const isRecalledLast = !!item.lastMessage?.is_recalled;
        const isPinned = pinnedIds.has(item.partnerId);
        const isMuted = mutedIds.has(item.partnerId);
        return (
          <button
            key={`dm-${item.partnerId}`}
            className={`chat-list-row active:scale-[0.98] transition-all duration-150 ${item.unread > 0 ? "is-unread" : ""}`}
            onClick={() => void openChat(item.partnerId)}
            // Prefetch: hover / vừa chạm là đã tải sẵn trang tin nhắn đầu tiên
            // → khi click là hiện ngay từ cache.
            onMouseEnter={() => { prefetchProfile(item.partnerId); me?.id && prefetchConversation(me.id, item.partnerId, clearedMapRef.current[item.partnerId] ?? 0); }}
            onTouchStart={() => { prefetchProfile(item.partnerId); me?.id && prefetchConversation(me.id, item.partnerId, clearedMapRef.current[item.partnerId] ?? 0); }}
            onFocus={() => { prefetchProfile(item.partnerId); me?.id && prefetchConversation(me.id, item.partnerId, clearedMapRef.current[item.partnerId] ?? 0); }}
            onContextMenu={(e) => {
              e.preventDefault();
              setConvMenu({ id: item.partnerId, name: resolveUserName(item.profile as any, "Người dùng"), kind: "dm" });
            }}
            {...longPressProps(() =>
              setConvMenu({ id: item.partnerId, name: resolveUserName(item.profile as any, "Người dùng"), kind: "dm" })
            )}
          >
            {(() => {
              const inactive = (item.profile as any)?.seed_status === "inactive" || ((item.profile as any)?.is_virtual && (item.profile as any)?.is_active === false);
              const avatarStyle = inactive ? { filter: "grayscale(0.85) opacity(0.7)" } : undefined;
              const displayName = inactive ? "Người dùng không hoạt động" : (resolveUserName(item.profile as any, "Người dùng"));
              return (
                <>
                  <span className="chat-list-avatar-wrap" style={avatarStyle}>
                    <AvatarGlow
                      avatar={item.profile.avatar}
                      userId={item.partnerId}
                      size={44}
                      alt={displayName}
                      imgClassName="chat-list-avatar"
                    />
                    {!inactive && (
                      <PresenceDot
                        userId={item.partnerId}
                        lastSeen={(item.profile as any)?.last_seen}
                        isVirtual={(item.profile as any)?.is_virtual}
                      />
                    )}
                  </span>
                  <div className="chat-list-body">
                    <div className="chat-list-row1">
                      <span className="chat-list-name inline-flex items-center gap-1.5" style={item.unread > 0 ? { fontWeight: 700 } : undefined}>
                        <span className="truncate" style={inactive ? { fontStyle: "italic", opacity: 0.75 } : undefined}>{displayName}</span>
                        {!inactive && <GenderIcon gender={(item.profile as any)?.gender} />}
                      </span>
                <span className="chat-list-time inline-flex items-center gap-1">
                  {isMuted ? <BellOff size={11} className="opacity-60" /> : null}
                  {isPinned ? <Pin size={11} className="opacity-70" /> : null}
                  {formatChatListTime(lastTs)}
                </span>
              </div>
              <div className="chat-list-row2">
                <span
                  className="chat-list-preview"
                  style={
                    isRecalledLast
                      ? { fontStyle: "italic", opacity: 0.75 }
                      : item.unread > 0
                        ? { fontWeight: 700, color: "hsl(var(--foreground))" }
                        : undefined
                  }
                >
                  {isSelfLast && !isRecalledLast ? <span className="chat-list-prefix">Bạn: </span> : null}
                  {preview}
                </span>
                {item.lastMessage ? (
                  (() => {
                    const seen = isSelfLast
                      ? (item.lastMessage as any)?.is_read === true
                      : item.unread === 0;
                    return (
                      <span className={`chat-seen-chip ${seen ? "is-seen" : "is-unseen"}`}>
                        {seen ? "Đã xem" : "Chưa xem"}
                      </span>
                    );
                  })()
                ) : null}
                {item.unread > 0 ? <span className="chat-unread-pill">{item.unread > 99 ? "99+" : item.unread}</span> : null}

              </div>
            </div>
                </>
              );
            })()}
          </button>
        );
      })}

      {convMenu ? (
        <div className="cx-sheet-backdrop" onClick={() => setConvMenu(null)} role="dialog" aria-modal="true">
          <div className="cx-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cx-sheet-title">{convMenu.name}</div>
            <button
              className="cx-sheet-item"
              onClick={() => { togglePin(convMenu.id); setConvMenu(null); }}
            >
              {pinnedIds.has(convMenu.id) ? <PinOff size={18} /> : <Pin size={18} />}
              {pinnedIds.has(convMenu.id) ? "Bỏ ghim cuộc trò chuyện" : "Ghim cuộc trò chuyện"}
            </button>
            <button
              className="cx-sheet-item"
              onClick={() => { toggleMute(convMenu.id); setConvMenu(null); }}
            >
              {mutedIds.has(convMenu.id) ? <BellRing size={18} /> : <BellOff size={18} />}
              {mutedIds.has(convMenu.id) ? "Bật thông báo" : "Tắt thông báo"}
            </button>
            {convMenu.kind === "dm" ? (
              <button
                className="cx-sheet-item is-danger"
                onClick={() => { const c = convMenu; setConvMenu(null); setConfirmDelete({ id: c.id, name: c.name }); }}
              >
                <Trash2 size={18} /> Xoá cuộc trò chuyện
              </button>
            ) : null}
          </div>
          <button className="cx-sheet-cancel" onClick={() => setConvMenu(null)}>Huỷ</button>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="cx-sheet-backdrop" onClick={() => setConfirmDelete(null)} style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            className="cx-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 340, width: "100%", padding: 20, textAlign: "center" }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Xoá đoạn chat?</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
              Bạn có chắc chắn muốn xoá toàn bộ đoạn chat với <b>{confirmDelete.name}</b> không?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cx-sheet-cancel" style={{ flex: 1, marginTop: 0 }} onClick={() => setConfirmDelete(null)}>Huỷ</button>
              <button
                className="cx-sheet-cancel"
                style={{ flex: 1, marginTop: 0, color: "#ff3b30" }}
                onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); void deleteChatLocally(id); }}
              >
                Xoá
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateGroup ? (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(gid) => { setShowCreateGroup(false); setActiveGroupId(gid); }}
        />
      ) : null}

      {showVipGate ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onClick={() => setShowVipGate(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-card text-card-foreground shadow-2xl border border-border/60 p-6 text-center animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-rose-400/20 text-amber-500">
              <span style={{ fontSize: 28 }}>👑</span>
            </div>
            <h3 className="text-lg font-bold mb-1.5">Tính năng dành cho VIP 5</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Tính năng tạo nhóm chỉ dành cho thành viên đạt <b>VIP 5</b> trở lên. Hãy nâng cấp để mở khoá cùng nhiều đặc quyền khác.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-2xl py-3 text-sm font-semibold text-white shadow bg-gradient-to-r from-amber-500 via-rose-500 to-fuchsia-500 hover:opacity-95 active:scale-[0.99] transition"
                onClick={() => {
                  setShowVipGate(false);
                  if (typeof window !== "undefined") window.location.href = "/wallet";
                }}
              >
                Nâng cấp VIP
              </button>
              <button
                type="button"
                className="w-full rounded-2xl py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition"
                onClick={() => setShowVipGate(false)}
              >
                Để sau
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toastMsg ? <div className="tg-toast" key={toastMsg + Date.now()}>{toastMsg}</div> : null}
    </section>
  );
}

function ChatSearchOverlay({
  messages,
  query,
  onQueryChange,
  onClose,
  meId,
}: {
  messages: MessageRecord[];
  query: string;
  onQueryChange: (v: string) => void;
  onClose: () => void;
  meId?: string | null;
}) {
  const q = query.trim().toLowerCase();
  const results = q
    ? messages.filter((m) => (m.content || "").toLowerCase().includes(q))
    : [];
  return (
    <div
      className="tg-sheet-backdrop"
      onClick={onClose}
      style={{ justifyContent: "flex-start", padding: 0 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "hsl(var(--background))",
          width: "100%",
          maxHeight: "80vh",
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          padding: "12px 14px 16px",
          display: "flex", flexDirection: "column", gap: 10,
          animation: "tg-sheet-up .22s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={16} className="opacity-60" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm trong 30 tin nhắn gần nhất..."
            className="app-input"
            style={{ flex: 1, padding: "10px 14px", fontSize: 14 }}
          />
          <button onClick={onClose} aria-label="Đóng" className="icon-button" style={{ width: 36, height: 36 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {!q ? (
            <div style={{ fontSize: 13, color: "var(--tg-text-muted)", textAlign: "center", padding: 16 }}>
              Nhập từ khoá để tìm trong cuộc trò chuyện này.
            </div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--tg-text-muted)", textAlign: "center", padding: 16 }}>
              Không tìm thấy kết quả nào.
            </div>
          ) : (
            results.map((m) => {
              const isSelf = m.sender_id === meId;
              const time = new Date(m.created_at ?? Date.now()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
              return (
                <div
                  key={m.id}
                  style={{
                    background: "hsl(var(--muted))",
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--tg-text-muted)", marginBottom: 2, fontWeight: 600 }}>
                    {isSelf ? "Bạn" : "Đối phương"} · {time}
                  </div>
                  <div style={{ wordBreak: "break-word" }}>{m.content}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * MessageGesture — bọc một bubble tin nhắn để hỗ trợ:
 *  - Giữ lâu (long-press) → mở menu (Trả lời / Sao chép / Xoá / Tố cáo).
 *  - Vuốt sang phải (bubble của người khác) hoặc sang trái (bubble của mình) → Trả lời.
 * Giống Messenger / Telegram.
 */
function MessageGesture({
  isSelf,
  onMenu,
  children,
}: {
  isSelf: boolean;
  onMenu: () => void;
  children: React.ReactNode;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const clearLong = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    longFired.current = false;
    clearLong();
    longTimer.current = setTimeout(() => {
      longFired.current = true;
      onMenu();
    }, 450);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const deltaX = e.clientX - startX.current;
    const deltaY = e.clientY - startY.current;
    // Bỏ hoàn toàn swipe — chỉ cần long-press mở menu.
    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) clearLong();
  };

  const finish = () => {
    clearLong();
  };

  return (
    <div
      style={{ position: "relative" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={finish}
      onContextMenu={(e) => { e.preventDefault(); onMenu(); }}
    >
      {children}
    </div>
  );
}

