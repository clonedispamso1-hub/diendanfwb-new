import type React from "react";
import { BaitGroupsList } from "@/components/candy/bait-groups-list";
import { GroupCard } from "@/components/candy/group-card";
import { HotBadge999 } from "@/components/candy/bait-groups-list";
import { ChatComposerInput } from "@/components/candy/chat-composer-input";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Users, MoreVertical, Phone, Video, Search, Pin, BellOff, Trash2, X, BellRing, PinOff, Copy, MoreHorizontal, Flag, Clock, Smile, Pencil, RotateCcw, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { gifToken, RichText } from "@/lib/rich-content";
import { hasBaitFocus, focusBaitGroup, BAIT_FOCUS_EVENT } from "@/lib/bait-group-token";

import { supabase } from "@/lib/supabase";
import { fetchProfileById, peekProfile } from "@/lib/profile-cache";
import { usePrefetchProfile } from "@/hooks/use-profile-query";

const CHAT_PARTNER_PROFILE_COLS = "id, username, full_name, display_name, avatar, avatar_url, bio, location, province, followers_count, vip_level, vip_exp, role, is_admin, is_online, is_banned, banned_until, status, trust_score, last_seen, title_gif_url, is_virtual, height, weight, intent, gender, public_id, is_seed_account, seed_status, relationship_status, age, is_fwb_active, interests, is_clone, verified, city, nickname, birthday, zodiac, badge_id, vip_media, call_video_url, call_voice_url, identity_crown, identity_pet, identity_flag";

import type { MessageRecord, Profile } from "@/lib/app-types";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { createMessageCompat } from "@/lib/db-compat";
import { ReportRewardModal } from "@/components/candy/report-reward-modal";
import { UserDisplayName } from "@/components/vip/user-display-name";
import UniversalBadge from "@/components/candy/universal-badge";
import { useIsVip, type VipProfileLike } from "@/lib/vip-status";
import { GenderIcon } from "@/components/candy/gender-icon";
import { useIsOnline, formatLastSeen } from "@/lib/presence";
import { PresenceDot } from "@/components/candy/presence-status";
import { sendVirtualMessage } from "@/lib/virtual-profiles";
import { CreateGroupModal } from "@/components/candy/create-group-modal";
import { GroupChatPage } from "@/components/candy/group-chat-page";

import { ChatCompatibilityHeader } from "@/components/candy/chat-compatibility-header";
import { useMessageReactions, REACTION_EMOJIS } from "@/lib/message-reactions";
import { ReactionViewer } from "@/components/candy/reaction-viewer";
import { usePeerTyping, useSendTyping } from "@/lib/seed-typing";
import { getMessagePreview, isVoiceMessage } from "@/lib/message-preview";
import { VoiceBubble } from "@/components/candy/voice-bubble";
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";
import { parseVoiceMarker } from "@/lib/voice-chat";
import { hasVipPaymentToken, parseVipPayment, vipPaymentToken } from "@/lib/vip-payment";
import { VipPaymentCard } from "@/components/candy/vip-payment-card";
import { GifPicker } from "@/components/candy/gif-picker";
import { ComposerPlusMenu } from "@/components/candy/composer-plus-menu";
import { MemberGuideCard, MemberGuideDetailSheet } from "@/components/candy/member-guide-card";
import { type GuideCardContent, parseGuideCard } from "@/lib/member-guide-card";
import { CrmChatCard } from "@/components/candy/crm-chat-card";
import { SectionErrorBoundary } from "@/components/candy/section-error-boundary";
import { CrmAdminSheet } from "@/components/candy/crm-admin-sheet";
import { AdminGuideModal } from "@/components/admin-v3/crm/AdminGuideModal";
import { crmCardToken, hasCrmCardToken, parseCrmCard, stripCrmCardTokens } from "@/lib/crm-chat-card";
import { fromCardItem, fromCardToken, hasFromCardToken, parseFromCard, stripFromCardTokens } from "@/lib/crm-from-card";
import type { FromCardVipGroup } from "@/lib/crm-from-card";
import {
  activeCommunityVipNotes,
  applyLocationName,
  communityVipConfigFor,
  fetchCommunityVipConfigs,
  fetchCommunityVipSets,
  ensureCommunityVipSet,
  zaloLogoUrl,
} from "@/lib/crm-community-vip";
import {
  activeMemberBenefits,
  fetchMemberBenefits,
  memberBenefitsFor,
} from "@/lib/crm-member-benefits";
import { FromChatCard } from "@/components/candy/crm-from-card";
import { activeCommunityRules, communityRulesFor, fetchCommunityRules } from "@/lib/crm-community-rules";
import { activeFeeConfig, fetchFeeConfig } from "@/lib/crm-fee-config";
import { CommunityVipRegionPicker } from "@/components/candy/community-vip-region-picker";
import { GLOBAL_SCOPE, fetchRegionGuides, regionGuideText, toProvince } from "@/lib/crm-guide-regions";
import { applyRegion } from "@/lib/crm-guide-content";
import { useKeyboardViewport } from "@/hooks/use-keyboard-viewport";
import { PremiumFlameIcon } from "@/components/candy/premium-flame-icon";
import { DepositNoQrModal } from "@/components/candy/deposit-no-qr-modal";
import { DepositQrModal } from "@/components/candy/deposit-qr-modal";
import { EditCardPopup } from "@/components/candy/edit-card-popup";
import { CoinTransferChatModal } from "@/components/candy/coin-transfer-chat-modal";
import { CoinTransferBillCard, CoinTransferBillModal } from "@/components/candy/coin-transfer-bill-card";
import {
  type CoinBillPayload,
  coinBillToken,
  coinBillToPlainText,
  parseCoinBill,
  stripCoinBillTokens,
} from "@/lib/coin-transfer-bill";

import { ProfileShareMessage } from "@/components/candy/profile-share-message";
import { parseProfileShare } from "@/lib/profile-share";
import { recordPing, sendProfileCardFrom, useMarkPinged, usePingStatus } from "@/lib/ping-actions";
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
  /**
   * Đồng bộ URL với hội thoại đang mở.
   * Bắt buộc: layout wrapper (.mobile-frame is-chat-detail / is-chat-list)
   * được tính từ URL, nên mở/đóng hội thoại PHẢI đổi URL, không chỉ đổi state.
   */
  onChatTargetChange?: (userId: string | null) => void;
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
  const crmCard = parseCrmCard(msg.content);
  if (crmCard) return crmCard.status === "submitted" ? "Đã gửi thông tin CRM" : `VIP Zalo ${crmCard.location}`;
  const text = getMessagePreview(msg, isSelfLast);
  return text;
}

/** Trạng thái long-press dùng chung cho cả danh sách (chỉ 1 ngón tại 1 thời điểm). */
type LongPressCtl = {
  timer: ReturnType<typeof setTimeout> | null;
  fired: boolean;
  sx: number;
  sy: number;
};

/**
 * Handler long-press (~450ms) dùng cho hàng danh sách chat.
 *
 * Timer nằm trong ref dùng chung của trang (không phải biến cục bộ của mỗi lần
 * render): khi bấm mở hội thoại, hàng sẽ unmount ngay và pointerup không bao giờ
 * tới closure cũ → timer cũ vẫn chạy và mở menu "ma" sau khi quay lại. Ref dùng
 * chung cho phép huỷ timer ở click, khi đổi hội thoại và khi unmount.
 */
function longPressProps(ctl: React.MutableRefObject<LongPressCtl>, onLongPress: () => void) {
  const clear = () => {
    if (ctl.current.timer) { clearTimeout(ctl.current.timer); ctl.current.timer = null; }
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      const c = ctl.current;
      c.sx = e.clientX; c.sy = e.clientY; c.fired = false;
      clear();
      c.timer = setTimeout(() => {
        ctl.current.timer = null;
        ctl.current.fired = true;
        onLongPress();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const c = ctl.current;
      if (Math.abs(e.clientX - c.sx) > 8 || Math.abs(e.clientY - c.sy) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture: (e: React.MouseEvent) => {
      clear();
      if (ctl.current.fired) { e.preventDefault(); e.stopPropagation(); ctl.current.fired = false; }
    },
  };
}


/** Hàng hội thoại VIP dùng đúng nguồn trạng thái đang điều khiển icon sau tên. */
function VipChatListRow({
  profile,
  userId,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  profile: VipProfileLike;
  userId: string;
}) {
  const isVip = useIsVip(userId, profile);

  return (
    <button
      className={`${className ?? ""}${isVip ? " is-vip" : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Hàng bubble tin nhắn — trạng thái VIP lấy theo ĐÚNG sender_id của message,
 * dùng chung nguồn `useIsVip` đang điều khiển icon VIP hiển thị sau tên.
 */
function VipBubbleRow({
  senderId,
  profile,
  className,
  children,
}: {
  senderId: string | null | undefined;
  profile: VipProfileLike;
  className: string;
  children: React.ReactNode;
}) {
  const isVip = useIsVip(senderId ?? null, profile);
  return <div className={`${className}${isVip ? " is-vip" : ""}`}>{children}</div>;
}

export function ChatPage({ targetUserId, onOpenProfile, onChatTargetChange }: ChatPageProps) {
  const { me, refreshMe } = useAuth();
  const [activeChat, setActiveChat] = useState<string | null>(targetUserId);
  const [activeName, setActiveName] = useState("");
  const [activePartner, setActivePartner] = useState<Partial<Profile> | null>(null);
  const [chatList, setChatList] = useState<InboxItem[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  // Nội dung ô nhập sống trong ref (uncontrolled) → gõ phím không re-render
  // toàn bộ khung chat. `composerResetKey` chỉ đổi khi cha ghi giá trị mới.
  const textRef = useRef("");
  const [composerResetKey, setComposerResetKey] = useState(0);
  const setText = useCallback((v: string) => {
    textRef.current = v;
    setComposerResetKey((k) => k + 1);
  }, []);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [depositNoQrOpen, setDepositNoQrOpen] = useState(false);
  const [depositQrOpen, setDepositQrOpen] = useState(false);
  const [crmAdminOpen, setCrmAdminOpen] = useState(false);
  const [crmGuideOpen, setCrmGuideOpen] = useState(false);
  const [crmGuideRegion, setCrmGuideRegion] = useState<string | null>(null);
  const [communityVipRegionOpen, setCommunityVipRegionOpen] = useState(false);
  const [crmNotificationCount, setCrmNotificationCount] = useState(0);
  const [submittedCrmCards, setSubmittedCrmCards] = useState<Map<string, { name: string; phone: string; region: string; district: string }>>(new Map());
  const [editCardOpen, setEditCardOpen] = useState(false);
  const [coinTransferOpen, setCoinTransferOpen] = useState(false);
  const [openCoinBill, setOpenCoinBill] = useState<CoinBillPayload | null>(null);
  const [openGuideCard, setOpenGuideCard] = useState<GuideCardContent | null>(null);
  const isChatAdmin = Boolean((me as unknown as { is_admin?: boolean } | null)?.is_admin);
  const gifButtonRef = useRef<HTMLButtonElement | null>(null);
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
  /**
   * Cuộc trò chuyện đã THỰC SỰ được openChat() nạp (profile + tin nhắn), theo
   * key `${meId}:${partnerId}`. Khác với activeChatRef (chỉ là state UI, được
   * khởi tạo sẵn = targetUserId ngay khi mount). Nếu dùng activeChatRef để
   * chống gọi lặp thì lần mở từ Hồ sơ → Nhắn tin (mount với targetUserId có
   * sẵn) sẽ bị bỏ qua hoàn toàn → không có tin nhắn cũ, tiêu đề treo "Đang tải…".
   */
  const openedChatRef = useRef<string | null>(null);
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
  const conversationLongPress = useRef<LongPressCtl>({ timer: null, fired: false, sx: 0, sy: 0 });
  /** Tìm kiếm & tab lọc danh sách hội thoại. */
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxTab, setInboxTab] = useState<"dm" | "group">(() => {
    if (hasBaitFocus()) return "group";
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("bait"))
      return "group";
    return "dm";
  });

  /**
   * Deep link từ "Card Nhóm" (bài viết / bình luận / tin nhắn):
   *   /chat?group=<id>  → mở thẳng phòng chat nhóm thật
   *   /chat?bait=<id>   → mở tab Nhóm và focus đúng nhóm mồi đó
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const realGroup = params.get("group");
    const bait = params.get("bait");
    if (!realGroup && !bait) return;
    if (realGroup) setActiveGroupId(realGroup);
    if (bait) {
      focusBaitGroup(bait);
      setInboxTab("group");
    }
    // Dọn URL để F5 không mở lại phòng cũ.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  /**
   * Bấm "Vào" trên Card Nhóm khi ĐANG ở trang Tin nhắn: không có remount nên
   * phải nghe event để đóng hội thoại, nhảy sang tab Nhóm và focus nhóm đó.
   */
  useEffect(() => {
    const onFocusBait = () => {
      onChatTargetChangeRef.current?.(null);
      setActiveChat(null);
      setActiveGroupId(null);
      setInboxTab("group");
    };
    window.addEventListener(BAIT_FOCUS_EVENT, onFocusBait as EventListener);
    return () => window.removeEventListener(BAIT_FOCUS_EVENT, onFocusBait as EventListener);
  }, []);

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

  // Ping: chỉ query trạng thái của đúng cuộc trò chuyện đang mở (cache 5 phút).
  const { data: alreadyPinged = false } = usePingStatus(me?.id ?? null, activeChat);
  const markPinged = useMarkPinged();

  // Gift feature removed from Chat UI.

  // Bỏ qua tin optimistic (id "temp-…") — không phải uuid hợp lệ để query reactions.
  const messageIds = useMemo(
    () => messages.map((m) => m.id).filter((id) => !String(id).startsWith("temp-")),
    [messages],
  );
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  // Ref để listener global (không có deps) luôn gọi được callback mới nhất.
  const onChatTargetChangeRef = useRef(onChatTargetChange);
  useEffect(() => { onChatTargetChangeRef.current = onChatTargetChange; }, [onChatTargetChange]);
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

  const refreshCrmNotificationCount = useCallback(async () => {
    if (!me?.id || !isChatAdmin) return;
    const { count } = await supabase
      .from("notifications" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.id)
      .eq("type", "crm_submission")
      .eq("is_read", false);
    setCrmNotificationCount(count ?? 0);
  }, [me?.id, isChatAdmin]);

  useEffect(() => {
    if (!me?.id || !isChatAdmin) return;
    void refreshCrmNotificationCount();
    const channel = supabase
      .channel(`crm-chat-notifications-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, () => {
        void refreshCrmNotificationCount();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me?.id, isChatAdmin, refreshCrmNotificationCount]);

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
      onChatTargetChange?.(null);
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
      onChatTargetChange?.(null);
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

  // Mobile: bám theo visual viewport để ô nhập luôn nằm ngay trên bàn phím.
  useKeyboardViewport(!!activeChat, scrollRef);

  // Ô nhập tự cao dần theo nội dung — xử lý bên trong <ChatComposerInput>
  // (gom vào requestAnimationFrame, không đo layout theo từng ký tự).
  const inputRef = useRef<HTMLTextAreaElement | HTMLDivElement | null>(null);

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

  const partnerReplyStatus = useMemo(() => {
    if (!activeChat || !messages.length) return "Truy cập gần đây";
    const latest = messages[messages.length - 1];
    return latest.sender_id === activeChat ? "Hoạt động" : "Truy cập gần đây";
  }, [activeChat, messages]);

  // Giao diện đặc biệt chỉ phụ thuộc đúng cờ is_admin của người đối diện.
  const activePartnerIsAdmin = activePartner?.is_admin === true;

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
          lastPreview: msg?.content ? getMessagePreview(msg as any) : "Chưa có tin nhắn",
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
    // Đánh dấu ngay để effect theo URL không mở lại đúng hội thoại này lần nữa.
    openedChatRef.current = `${me?.id ?? ""}:${partnerId}`;
    // Dựng ngay màn hội thoại hiện có; các tác vụ DB chỉ nạp dữ liệu cho nó.
    // Không chờ cleared_at trước khi render vì truy vấn chậm/lỗi khi mở từ Hồ sơ
    // từng để lại đúng một khung nền tối không header/composer.
    setActiveChat(partnerId);
    setNotMatched(false);
    setBlockedRel({ iBlocked: false, theyBlocked: false });
    setMessages([]);
    setActivePartner(null);
    setActiveName("");
    setShowMenu(false);
    setCallNotice(null);
    setMsgMenu(null);

    // Nạp mốc cleared_at TRƯỚC (cache/dedupe) — mở từ Hồ sơ → Nhắn tin không
    // bao giờ dựng lại tin cũ do map chưa kịp load.
    if (me?.id) {
      const clears = await ensureClearsMap(me.id).catch((error) => {
        console.warn("[chat] load conversation clears failed", error);
        return {};
      });
      clearedMapRef.current = { ...clears, ...clearedMapRef.current };
      setClearedMap((prev) => ({ ...clears, ...prev }));
    }
    // KHÔNG gỡ mốc cleared_at khi mở chat từ Hồ sơ / Search / Deep Link.
    // loadMessages sẽ lọc theo cleared_at → user không nhìn thấy tin nhắn cũ.
    // Chỉ tin nhắn mới do partner gửi sau mốc mới được hiển thị.

    // Reset rồi load quan hệ chặn 2 chiều
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


  // URL là nguồn sự thật duy nhất cho "đang mở hội thoại nào".
  // Khi URL quay về /chat (nút Quay lại hoặc Back của trình duyệt) → đóng hội
  // thoại trong state để state và class layout luôn khớp nhau.
  useEffect(() => {
    if (targetUserId) {
      // Chỉ bỏ qua khi hội thoại NÀY đã được nạp xong cho ĐÚNG user hiện tại.
      const key = `${me?.id ?? ""}:${targetUserId}`;
      if (openedChatRef.current === key) return;
      openedChatRef.current = key;
      void openChat(targetUserId);
    } else {
      openedChatRef.current = null;
      if (activeChatRef.current !== null) {
        setActiveChat(null);
        setActiveName("");
        setActivePartner(null);
      }
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
  const [sending, setSending] = useState(false);
  /** Sao chép nội dung tin nhắn (không bao giờ lộ marker nội bộ). */
  const copyMessage = async (message: MessageRecord) => {
    const bill = parseCoinBill(message.content);
    if (parseCrmCard(message.content)) {
      showToast("Nội dung này không thể sao chép");
      return;
    }
    if (parseGuideCard(message.content)) {
      showToast("Nội dung này không thể sao chép");
      return;
    }
    const plain = bill ? coinBillToPlainText(bill) : stripCoinBillTokens(message.content ?? "");
    try {
      await navigator.clipboard.writeText(plain);
      showToast("Đã sao chép");
    } catch {
      showToast("Không sao chép được");
    }
  };

  // ---- Tin nhắn đang chờ (Message Request): giới hạn 2 tin khi chưa chấp nhận.
  const requestState = useMemo(
    () => computeRequestState(messages as any[], me?.id ?? null, activeChat),
    [messages, me?.id, activeChat],
  );

  const sendMessage = async (
    override?: string,
    opts?: { internal?: boolean },
  ): Promise<boolean> => {
    const rawDraft = (override ?? textRef.current).trim();
    // Nội dung do người dùng nhập/dán: gỡ mọi marker biên lai nội bộ
    // → chỉ gửi đi như văn bản thường, không tạo giao dịch mới.
    if (!opts?.internal && (hasVipPaymentToken(rawDraft) || hasCrmCardToken(rawDraft) || hasFromCardToken(rawDraft))) {
      showToast("Không thể gửi nội dung hệ thống dưới dạng tin nhắn văn bản");
      return false;
    }
    const draft = opts?.internal
      ? rawDraft
      : stripFromCardTokens(stripCrmCardTokens(stripCoinBillTokens(rawDraft)));
    if (!me || !activeChat || !draft) return false;

    // Chống bấm liên tục / Enter dồn dập: chỉ 1 request đang bay tại một thời điểm.
    if (sendingRef.current) return false;
    if (requestState.locked && !isAcceptSystemMessage(draft)) {
      alert(PENDING_LOCKED_TEXT);
      return false;
    }

    sendingRef.current = true;
    setSending(true);
    const content = draft;
    const replySnapshot = replyTo;
    const partnerSnapshot = activeChat;
    const isVirtual = Boolean((activePartner as any)?.is_virtual);

    // ===== OPTIMISTIC NGAY LẬP TỨC (trước mọi await) — UI phản hồi tức thì.
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

    const rollback = (restoreInput: boolean) => {
      setMessages((cur) => cur.filter((m) => m.id !== tempId));
      if (restoreInput && !override) setText(content);
      setReplyTo(replySnapshot);
    };

    try {
      // Restriction gate — messaging may be blocked by admin.
      {
        const { ensureAllowed } = await import("@/lib/restriction-guard");
        if (!(await ensureAllowed("message"))) {
          rollback(true);
          return false;
        }
      }

      // Chặn 2 chiều: nếu mình đã chặn họ HOẶC họ đã chặn mình → không cho gửi.
      const { data: blockRows } = await supabase
        .from("user_blocks" as any)
        .select("blocker_id, target_id")
        .or(
          `and(blocker_id.eq.${me.id},target_id.eq.${activeChat}),and(blocker_id.eq.${activeChat},target_id.eq.${me.id})`,
        );
      if (blockRows && blockRows.length > 0) {
        const iBlocked = (blockRows as any[]).some((r) => r.blocker_id === me.id);
        rollback(true);
        alert(
          iBlocked
            ? "Bạn đã chặn người này. Hãy gỡ chặn trong Trang cá nhân → Đã chặn để gửi tin."
            : "Không thể gửi tin nhắn đến người dùng này.",
        );
        return false;
      }

      try {
        if (isVirtual) {
          await sendVirtualMessage(partnerSnapshot, me.id, content, replySnapshot?.id ?? null);
        } else {
          await createMessageCompat(me.id, partnerSnapshot, content, null, replySnapshot?.id ?? null);
        }
        // Gửi xong → mở khoá nút ngay, đồng bộ DB chạy nền (không chặn UI).
        sendingRef.current = false;
        setSending(false);
        // loadMessages ghi đè mảng bằng dữ liệu thật → temp biến mất, không trùng.
        await loadMessages(partnerSnapshot);
        setMessages((cur) => cur.filter((m) => m.id !== tempId));
        void loadChatList();
        return true;
      } catch (error: any) {
        // Rollback: gỡ temp + khôi phục input để user gửi lại.
        rollback(true);

        // Hạn chế (guard phía client hoặc trigger database) → popup + toast riêng.
        {
          const { handleRestrictionError } = await import("@/lib/restriction-guard");
          if (await handleRestrictionError(error)) return false;
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
        return false;
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    return false;
  };

  const sendCrmCard = async () => {
    const location = String((activePartner as any)?.location || (activePartner as any)?.province || (activePartner as any)?.city || "").trim();
    if (!location) {
      showToast("Khách hàng chưa có khu vực đăng ký");
      return;
    }
    const ok = await sendMessage(crmCardToken({ cardId: crypto.randomUUID(), location, status: "pending" }), { internal: true });
    if (ok) {
      setCrmAdminOpen(false);
      showToast("Đã gửi card CRM");
    }
  };

  const handleCrmSubmitted = (
    cardId: string,
    info: { name: string; phone: string; region: string; district: string },
  ) => {
    // Trạng thái gắn đúng card vừa submit; lần tải lại sẽ đọc từ chính message card trong DB.
    setSubmittedCrmCards((current) => new Map(current).set(cardId, info));
    showToast("Đã gửi thông tin thành công");
  };

  /** Số Zalo mà ĐÚNG khách hàng đang chat đã submit qua card của họ (dùng cho nút "Thông tin"). */
  const crmCustomerPhone = useMemo(() => {
    if (!isChatAdmin || !activeChat || !me?.id) return null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as any;
      if (message?.sender_id !== me.id || message?.receiver_id !== activeChat) continue;
      const card = parseCrmCard(message?.content);
      if (card?.status === "submitted" && card.phone) return card.phone;
    }
    return null;
  }, [messages, isChatAdmin, activeChat, me?.id]);

  /** Khu vực CRM của khách đang chat — LUÔN quy về Tỉnh/Thành phố (bỏ Quận/Huyện). */
  const crmCustomerProvince = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as any;
      const card = parseCrmCard(message?.content);
      if (card?.status === "submitted") {
        const p = toProvince(card.region || card.location);
        if (p) return p;
      }
    }
    const fallback =
      (activePartner as any)?.location ||
      (activePartner as any)?.province ||
      (activePartner as any)?.city ||
      "";
    return toProvince(String(fallback));
  }, [messages, activePartner]);

  /**
   * FROM → 3 loại hành vi:
   *  - card:   gửi Card nội dung hướng dẫn đúng khu vực của khách.
   *  - preset: gửi thẳng tin nhắn text Admin đã lưu trong Admin Panel.
   *  - manual: không gửi gì, Admin tự gõ tin nhắn.
   */
  const sendFromCard = async (itemId: string, selectedProvince?: string) => {
    const item = fromCardItem(itemId);
    if (!item) return;
    if (item.kind === "manual") {
      showToast("MỒI — Admin tự nhắn ở ô nhập tin nhắn");
      return;
    }
    // 6 mục (Quyền lợi, Nội Quy, Mồi phí, Phí không cao, Mồi thành công, Phí CR)
    // dùng nội dung CHUNG cho mọi khách — không hỏi/không lấy khu vực.
    const isGlobalItem = item.id !== "community-vip";
    const province = isGlobalItem
      ? GLOBAL_SCOPE
      : toProvince(selectedProvince || crmCustomerProvince);
    if (!province) {
      showToast("Khách hàng chưa có khu vực (Tỉnh/Thành phố)");
      return;
    }
    // Sáu mục đọc cấu hình dùng chung, nhưng nội dung gửi vẫn mang khu vực CRM
    // của chính khách đang chat. Tuyệt đối không đưa "__global__" ra giao diện.
    const customerRegion = toProvince(crmCustomerProvince);
    const regionLabel = isGlobalItem ? customerRegion : province;
    let text = "";
    try {
      const map = await fetchRegionGuides();
      text = regionGuideText(map, province, item.sectionId);
    } catch {
      if (item.id !== "community-vip" && item.id !== "quyen-loi") {
        showToast("Không tải được nội dung hướng dẫn");
        return;
      }
    }

    // Quyền lợi thành viên: lấy đúng cấu hình đã lưu của tỉnh/thành khách đang chat.
    let benefits: { title: string; content: string }[] = [];
    if (item.id === "quyen-loi") {
      try {
        const map = await fetchMemberBenefits();
        benefits = activeMemberBenefits(memberBenefitsFor(map, province), regionLabel);
      } catch {
        /* không tải được → dùng nội dung text nếu có */
      }
      if (!benefits.length && !text.trim()) {
        showToast("Chưa cấu hình Quyền lợi thành viên");
        return;
      }
    }

    // Nội Quy: lấy danh sách đang bật, đúng thứ tự và đúng tỉnh/thành của khách.
    let rules: { title: string; content: string }[] = [];
    if (item.id === "noi-quy") {
      try {
        const map = await fetchCommunityRules();
        rules = activeCommunityRules(communityRulesFor(map, province), regionLabel);
      } catch {
        /* dữ liệu danh sách cũ chưa có thì dùng nội dung text hiện có */
      }
      if (!rules.length && !text.trim()) {
        showToast("Chưa cấu hình Nội Quy");
        return;
      }
    }

    let fee: { eight_months: string; lifetime: string; notes: string[] } | null = null;
    if (item.id === "phi") {
      try {
        fee = activeFeeConfig(await fetchFeeConfig(text), regionLabel);
      } catch {
        showToast("Không tải được nội dung Phí CR");
        return;
      }
      if (!fee.eight_months && !fee.lifetime && !fee.notes.length) {
        showToast("Chưa cấu hình Phí CR");
        return;
      }
    }

    // Community VIP CR: dùng bộ nhóm ĐÃ LƯU của khu vực; tỉnh chưa từng khởi tạo
    // thì tạo ĐÚNG 1 LẦN rồi lưu vĩnh viễn (không random lại ở các lần sau).
    let vip: {
      avatar_url: string | null;
      groups: FromCardVipGroup[];
      intro: string;
      notes: string[];
    } | null = null;
    if (item.id === "community-vip") {
      try {
        const stored = await fetchCommunityVipSets();
        const { set } = await ensureCommunityVipSet(stored, province);
        if (set?.groups?.length) {
          let intro = "";
          let notes: string[] = [];
          try {
            const cfgMap = await fetchCommunityVipConfigs();
            const cfg = communityVipConfigFor(cfgMap, province);
            intro = applyLocationName(cfg.intro ?? "", province).trim();
            notes = activeCommunityVipNotes(cfg, province);
          } catch {
            /* chưa có nội dung Admin Panel → vẫn gửi card, không chặn */
          }
          vip = {
            avatar_url: set.avatar_url ?? null,
            intro,
            notes,
            groups: set.groups.map((g) => ({
              name: applyLocationName(g.name_template, set.province),
              district: g.district,
              members: g.members,
              men: g.men,
              women: g.women,
              admins: g.gold_key + g.silver_key,
              gold_key: g.gold_key,
              silver_key: g.silver_key,
            })),
          };
        }
      } catch (err) {
        showToast(
          err instanceof Error && err.message
            ? err.message
            : "Không tạo được Community VIP cho khu vực này",
        );
        return;
      }
    }

    if (!text.trim() && !vip && !benefits.length && !rules.length && !fee) {
      showToast(`Chưa có nội dung "${item.menuLabel}" cho ${province}`);
      return;
    }

    if (item.kind === "preset") {
      const ok = await sendMessage(applyRegion(text, regionLabel));
      if (ok) showToast("Đã gửi tin nhắn soạn sẵn");
      return;
    }

    let logoUrl = vip?.avatar_url ?? null;
    if (!logoUrl) logoUrl = await zaloLogoUrl();

    const ok = await sendMessage(
      fromCardToken({
        itemId: item.id,
        icon: item.icon,
        title: applyRegion(item.cardTitle, regionLabel),
        region: regionLabel,
        text: benefits.length || rules.length || fee ? "" : applyRegion(text, regionLabel),
        logo_url: logoUrl,
        ...(vip ? { vip } : {}),
        ...(benefits.length ? { benefits } : {}),
        ...(rules.length ? { rules } : {}),
        ...(fee ? { fee } : {}),
      }),
      { internal: true },
    );
    if (ok) showToast("Đã gửi Card");
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

  // Route target decides whether chat detail may render. `activeChat` can remain
  // populated until the cleanup effect runs, but `/chat` must paint the inbox
  // immediately so `.chat-fixed` never survives under the chat-list layout.
  if (targetUserId && activeChat === targetUserId) {
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
      <section className={`chat-fixed${activePartnerIsAdmin ? " chat-admin-surface" : ""}`}>
        <div className={`chat-fixed-header chat-fixed-header--minimal${activePartnerIsAdmin ? " chat-admin-header" : ""}`}>
          {/* Back = CHỈ điều hướng về /chat. Không được clear activeChat ở đây:
              nếu clear sớm thì URL vẫn là /chat/:id (parent .is-chat-detail)
              mà Messages đã render → STATE B. Việc reset activeChat/name/partner
              và loadChatList() do effect theo targetUserId đảm nhiệm, chạy sau
              khi route đã thực sự là /chat. */}
          <button className="icon-button" onClick={() => { onChatTargetChange?.(null); }}>
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
                {activePartnerIsAdmin ? (
                  <span className="chat-admin-badge" aria-label="Tài khoản quản trị viên">
                    <ShieldCheck aria-hidden size={12} />
                    Admin
                  </span>
                ) : null}
                {/* HỆ THỐNG 2: Media VIP dán ngay sát tên trong tin nhắn. */}
                

              </span>
              {peerViewing ? (
                <span className="chat-fixed-status chat-status-viewing">🟢 Đang xem</span>
              ) : partnerReplyStatus === "Hoạt động" ? (
                <span className="presence-status is-online">
                  <span className="presence-status__dot is-online presence-tick" aria-hidden />
                  <span className="presence-status__text">Hoạt động</span>
                </span>
              ) : (
                <span className="presence-status">Truy cập gần đây</span>
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
            const profileShare = parseProfileShare(message.content);
            const coinBill = parseCoinBill(message.content);
            const crmCard = parseCrmCard(message.content);
            const guideCard = parseGuideCard(message.content);
            const fromCard = parseFromCard(message.content);
            const crmLocal = crmCard ? submittedCrmCards.get(crmCard.cardId) : undefined;
            const crmCardData = crmCard && crmLocal
              ? { ...crmCard, status: "submitted" as const, ...crmLocal }
              : crmCard;

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
                  menuDisabled={Boolean(coinBill) || Boolean(crmCard) || Boolean(guideCard) || Boolean(fromCard) || Boolean(parseVipPayment(message.content))}
                  onMenu={() => { setMsgMenu({ message, isSelf }); }}
                >
                <VipBubbleRow
                  senderId={message.sender_id ?? senderId}
                  profile={sender as VipProfileLike}
                  className={`bubble-row bubble-row-luxe ${isSelf ? "is-self" : ""}${crmCard ? " has-crm-card" : ""}${fromCard ? " has-from-card" : ""}`}
                >
                {!isSelf ? (
                  <button type="button" className="bubble-avatar-btn" onClick={openProfile} aria-label={`Mở hồ sơ ${senderName}`}>
                    <AvatarGlow
                      avatar={senderAvatar}
                      userId={senderId ?? null}
                      size={32}
                      alt={senderName}
                      imgClassName="bubble-avatar"
                    />
                  </button>
                ) : null}
                <div
                  className="bubble-stack"
                  style={{
                    alignItems: isSelf ? "flex-end" : "flex-start",
                    width: crmCard || fromCard ? "100%" : "fit-content",
                    maxWidth: crmCard || fromCard ? "100%" : profileShare ? "86%" : "70%",
                    minWidth: 0,
                  }}
                >
                  <div className="bubble-header-luxe">
                    <button type="button" className="bubble-name-btn" onClick={openProfile} disabled={senderLocked}>{senderName}</button>
                    <UniversalBadge profile={sender as any} />
                  </div>
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
                    className={`flex flex-row items-start gap-1${crmCard ? " crm-message-flow" : ""}`}
                    style={{ flexDirection: isSelf ? "row-reverse" : "row", width: crmCard || fromCard ? "100%" : "fit-content", maxWidth: "100%" }}
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
                          {message.image_url ? (
                            <img
                              src={message.image_url}
                              alt="Ảnh trong tin nhắn"
                              className="chat-message-image"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                          {profileShare ? (
                            <ProfileShareMessage
                              kind={profileShare.kind}
                              profile={sender}
                              onOpenProfile={() => onOpenProfile(profileShare.userId)}
                            />
                          ) : coinBill ? (
                            <CoinTransferBillCard data={coinBill} onOpen={() => setOpenCoinBill(coinBill)} />
                           ) : crmCard ? (
                             <SectionErrorBoundary label="CRM card" resetKey={crmCard.cardId}>
                               <CrmChatCard
                                 data={crmCardData ?? crmCard}
                                 canOpen={!isSelf}
                                 onSubmitted={handleCrmSubmitted}
                               />
                             </SectionErrorBoundary>
                           ) : fromCard ? (
                             <FromChatCard data={fromCard} customerRegion={crmCustomerProvince} />
                           ) : guideCard ? (
                             <MemberGuideCard data={guideCard} onOpen={() => setOpenGuideCard(guideCard)} />
                          ) : parseVipPayment(message.content) ? (
                            <VipPaymentCard data={parseVipPayment(message.content)!} />
                          ) : parseVoiceMarker(message.content) ? (
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

                    {coinBill || crmCard || guideCard || fromCard ? null : (
                      <button
                        type="button"
                        className="bubble-menu-btn"
                        aria-label="Tuỳ chọn tin nhắn"
                        onClick={(e) => { e.stopPropagation(); setMsgMenu({ message, isSelf }); }}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )}
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
                          className={`message-reaction-badge${b.mine ? " is-mine" : ""}`}
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
                  <button type="button" className="bubble-avatar-btn" onClick={openProfile} aria-label="Mở hồ sơ của bạn">
                    <AvatarGlow
                      avatar={senderAvatar}
                      userId={senderId ?? null}
                      size={32}
                      alt={senderName}
                      imgClassName="bubble-avatar"
                    />
                  </button>
                ) : null}
                </VipBubbleRow>
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
                ref={gifButtonRef}
                type="button"
                className={`chat-composer-icon-btn chat-flame-button${plusMenuOpen || gifPickerOpen ? " is-active" : ""}`}
                aria-label={plusMenuOpen ? "Đóng tuỳ chọn đính kèm" : "Thêm"}
                aria-haspopup="menu"
                aria-expanded={plusMenuOpen}
                onClick={() => { setGifPickerOpen(false); setPlusMenuOpen((open) => !open); }}
              >
                <span className="chat-flame-glow" aria-hidden />
                <PremiumFlameIcon className="chat-flame-glyph" />
                <X className="chat-flame-close" aria-hidden />
              </button>
              <ChatComposerInput
                taRef={inputRef}
                valueRef={textRef}
                resetKey={composerResetKey}
                sending={sending}
                onSend={() => void sendMessage()}
                onTyping={sendTypingSignal}
                suppressAutofillToolbar
              />
              {requestState.note ? (
                <div className="chat-composer-note">
                  {requestState.note}
                </div>
              ) : null}
              <GifPicker
                open={gifPickerOpen}
                onClose={() => setGifPickerOpen(false)}
                anchorRef={gifButtonRef}
                onPick={(url) => {
                  setGifPickerOpen(false);
                  void sendMessage(gifToken(url));
                }}
              />
              <ComposerPlusMenu
                open={plusMenuOpen}
                onClose={() => setPlusMenuOpen(false)}
                anchorRef={gifButtonRef}
                isAdmin={isChatAdmin}
                crmNotificationCount={crmNotificationCount}
                pingDisabled={alreadyPinged}
                onSelect={(action) => {
                  setPlusMenuOpen(false);
                   if (action === "ping") {
                     const senderId = me?.id;
                     const receiverId = activeChat;
                     if (!senderId || !receiverId) return;
                     if (alreadyPinged) {
                       showToast("Bạn đã Ping người này rồi");
                       return;
                     }
                     void (async () => {
                       // Chống trùng ở database (PRIMARY KEY), không chỉ ở React state.
                       const result = await recordPing(senderId, receiverId);
                       if (result === "already") {
                         markPinged(senderId, receiverId);
                         showToast("Bạn đã Ping người này rồi");
                         return;
                       }
                       if (result === "error") {
                         showToast("Không gửi được Ping, vui lòng thử lại");
                         return;
                       }
                       markPinged(senderId, receiverId);
                        // Hệ thống tự tạo Profile Card của người được Ping: bản ghi tin nhắn
                        // có sender_id = người kia → hiển thị y như họ gửi card cho mình.
                        const ok = await sendProfileCardFrom(receiverId, senderId);
                        if (!ok) {
                          showToast("Không tạo được thẻ hồ sơ, vui lòng thử lại");
                          return;
                        }
                        await loadMessages(receiverId);
                        void loadChatList();
                     })();
                     return;
                   }
                     if (action === "coin-transfer") {
                      if (!me?.id || !activeChat) return;
                      if (me.id === activeChat) {
                        showToast("Bạn không thể tự chuyển Xu cho chính mình");
                        return;
                      }
                      setCoinTransferOpen(true);
                      return;
                    }
                    if (action === "edit-card") {
                      if (me?.id) setEditCardOpen(true);
                      return;
                    }
                   if (action === "gif") { setGifPickerOpen(true); return; }
                  if (action === "deposit-no-qr") {
                    if (!isChatAdmin) return;
                    setDepositNoQrOpen(true);
                    return;
                  }
                  if (action === "deposit-qr") {
                    if (!isChatAdmin) return;
                    setDepositQrOpen(true);
                    return;
                  }
                  if (action === "crm-customer") {
                    if (!isChatAdmin) return;
                    setCrmAdminOpen(true);
                    return;
                  }
                  if (typeof action === "string" && action.startsWith("from:")) {
                    if (!isChatAdmin) return;
                     const itemId = action.slice(5);
                     if (itemId === "community-vip") {
                       setCommunityVipRegionOpen(true);
                       return;
                     }
                     void sendFromCard(itemId);
                    return;
                  }
                  showToast("Bạn chưa dùng được tính năng này");
                }}
              />
              <DepositNoQrModal
                open={isChatAdmin && depositNoQrOpen}
                onClose={() => setDepositNoQrOpen(false)}
                onSubmit={(payload) => {
                  if (!isChatAdmin) return;
                  void sendMessage(vipPaymentToken(payload), { internal: true });
                }}
              />
              <DepositQrModal
                open={isChatAdmin && depositQrOpen}
                onClose={() => setDepositQrOpen(false)}
                onSubmit={(payload) => {
                  if (!isChatAdmin) return;
                  void sendMessage(vipPaymentToken(payload), { internal: true });
                }}
              />
              <CrmAdminSheet
                open={isChatAdmin && crmAdminOpen}
                onClose={() => setCrmAdminOpen(false)}
                onSend={() => void sendCrmCard()}
                customerPhone={crmCustomerPhone}
                onCustomerSelected={(region) => {
                  setCrmAdminOpen(false);
                  setCrmGuideRegion(region);
                  setCrmGuideOpen(true);
                }}
              />
              {isChatAdmin && crmGuideOpen ? <AdminGuideModal region={crmGuideRegion} onClose={() => setCrmGuideOpen(false)} /> : null}
              <CommunityVipRegionPicker
                open={isChatAdmin && communityVipRegionOpen}
                initialRegion={crmCustomerProvince}
                onClose={() => setCommunityVipRegionOpen(false)}
                onConfirm={(region) => {
                  setCommunityVipRegionOpen(false);
                  void sendFromCard("community-vip", region);
                }}
              />
              {activeChat && me?.id ? (
                <CoinTransferChatModal
                  open={coinTransferOpen}
                  onClose={() => setCoinTransferOpen(false)}
                  receiver={activePartner}
                  receiverId={activeChat}
                  onSuccess={(payload) => { void sendMessage(coinBillToken(payload), { internal: true }); }}
                />
              ) : null}
              <EditCardPopup
                open={editCardOpen}
                onClose={() => setEditCardOpen(false)}
                profile={me ?? null}
                showToast={showToast}
              />


            </div>
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

        {openCoinBill ? (
          <CoinTransferBillModal data={openCoinBill} onClose={() => setOpenCoinBill(null)} />
        ) : null}

        {openGuideCard ? (
          <MemberGuideDetailSheet data={openGuideCard} open onClose={() => setOpenGuideCard(null)} />
        ) : null}

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
    <section className="messages-inbox">

      {/* Search + Filter tabs */}
      <div className="messages-inbox__controls">
        <div className="messages-inbox__search">
          <Search size={17} className="messages-inbox__search-icon" />
          <input
            type="text"
            value={inboxSearch}
            onChange={(e) => setInboxSearch(e.target.value)}
            placeholder="Tìm kiếm thành viên..."
            className="messages-inbox__search-input"
            aria-label="Tìm kiếm thành viên"
          />
        </div>
        <div className="messages-inbox__tabs" role="tablist" aria-label="Loại hội thoại">
          <button
            type="button"
            onClick={() => {
              setInboxTab("dm");
              setGroupBadgeSeen(false);
            }}
            className={`messages-inbox__tab ${inboxTab === "dm" ? "is-active" : ""}`}
            role="tab"
            aria-selected={inboxTab === "dm"}
          >
            Tin nhắn
          </button>
          <button
            type="button"
            onClick={() => {
              setInboxTab("group");
              setGroupBadgeSeen(true);
            }}
            className={`messages-inbox__tab ${inboxTab === "group" ? "is-active" : ""}`}
            role="tab"
            aria-selected={inboxTab === "group"}
          >
            Nhóm
            {groupBadgeSeen ? null : <HotBadge999 className="absolute -top-1.5 -right-1.5" />}
          </button>
        </div>
      </div>

      <div className="messages-inbox__list">
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
            <div
              key={`g-${item.groupId}`}
              onContextMenu={(e) => { e.preventDefault(); setConvMenu({ id: gid, name: item.name, kind: "group" }); }}
              {...longPressProps(conversationLongPress, () => setConvMenu({ id: gid, name: item.name, kind: "group" }))}
            >
              <GroupCard
                name={item.name}
                blurPreview={false}
                previewText={
                  <>
                    {item.lastSenderId === me?.id ? <span className="chat-list-prefix">Bạn: </span> : null}
                    {item.lastPreview}
                  </>
                }
                trailing={
                  <span className="chat-list-time inline-flex items-center gap-1">
                    {isPinned ? <Pin size={11} className="opacity-70" /> : null}
                    {formatChatListTime(new Date(item.sortTs))}
                  </span>
                }
                onOpen={() => setActiveGroupId(item.groupId)}
              />
            </div>
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
          <VipChatListRow
            key={`dm-${item.partnerId}`}
            profile={item.profile as VipProfileLike}
            userId={item.partnerId}
            className={`chat-list-row active:scale-[0.98] transition-all duration-150 ${item.unread > 0 ? "is-unread" : ""}${item.profile?.is_admin === true ? " chat-admin-list-row" : ""}`}
            onClick={() => { onChatTargetChange?.(item.partnerId); void openChat(item.partnerId); }}
            // Prefetch: hover / vừa chạm là đã tải sẵn trang tin nhắn đầu tiên
            // → khi click là hiện ngay từ cache.
            onMouseEnter={() => { prefetchProfile(item.partnerId); me?.id && prefetchConversation(me.id, item.partnerId, clearedMapRef.current[item.partnerId] ?? 0); }}
            onTouchStart={() => { prefetchProfile(item.partnerId); me?.id && prefetchConversation(me.id, item.partnerId, clearedMapRef.current[item.partnerId] ?? 0); }}
            onFocus={() => { prefetchProfile(item.partnerId); me?.id && prefetchConversation(me.id, item.partnerId, clearedMapRef.current[item.partnerId] ?? 0); }}
            onContextMenu={(e) => {
              e.preventDefault();
              setConvMenu({ id: item.partnerId, name: resolveUserName(item.profile as any, "Người dùng"), kind: "dm" });
            }}
            {...longPressProps(conversationLongPress, () =>
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
                        <UserDisplayName
                          profile={inactive ? null : item.profile as any}
                          userId={item.partnerId}
                          name={displayName}
                          badgeSize={20}
                          hideMedal
                          nameClassName="truncate"
                          style={inactive ? { fontStyle: "italic", opacity: 0.75 } : undefined}
                        />
                        {!inactive && item.profile?.is_admin === true ? (
                          <span className="chat-admin-badge chat-admin-badge--list" aria-label="Tài khoản quản trị viên">
                            <ShieldCheck aria-hidden size={11} />
                            Admin
                          </span>
                        ) : null}
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
          </VipChatListRow>
        );
      })}
      </div>

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
  menuDisabled = false,
  onMenu,
  children,
}: {
  isSelf: boolean;
  menuDisabled?: boolean;
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
    if (menuDisabled) return;
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
    if (menuDisabled) return;
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
      className="message-gesture"
      style={{ position: "relative" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={finish}
      onContextMenu={(e) => { e.preventDefault(); if (!menuDisabled) onMenu(); }}
    >
      {children}
    </div>
  );
}

