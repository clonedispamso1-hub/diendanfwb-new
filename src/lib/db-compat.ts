import { supabase } from "@/lib/supabase";
import { db3 } from "@/lib/db/router";

/** dice_logs đã chuyển sang Supabase #3. */
const logsDb = () => db3() as any;
import type { PostRecord } from "@/lib/app-types";
import { uploadMediaUrl, type MediaKind } from "@/lib/media";
import { logActivity, truncate } from "@/lib/activity-log";
import { assertContentAllowed, screenContent, flagContentRecord } from "./keyword-filter";
import { guardAction } from "@/lib/rate-limit";

import { read3 } from "@/lib/content-db";
import { syncToS3 } from "@/lib/content-sync";
import { chatDb } from "@/lib/chat-db";
/**
 * @deprecated Wrapper mỏng — chuyển hướng vào MediaService.
 * Call site mới PHẢI dùng `uploadMedia({ kind, ... })` từ `@/lib/media`.
 */
function inferKind(bucket: string, prefix: string): MediaKind {
  if (bucket === "avatars" || prefix === "avatars") return "avatar";
  if (prefix === "profile-photos") return "gallery";
  if (bucket === "posts") return "post";
  if (bucket === "messages" || prefix?.startsWith("group-")) return "chat";
  return "other";
}

export async function uploadPublicFile(bucket: string, file: File, prefix: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Bạn cần đăng nhập trước khi tải tệp lên.");
  }
  return uploadMediaUrl(file, { kind: inferKind(bucket, prefix) });
}

export function resolvePostImage(post: PostRecord) {
  return post.image_url ?? post.image ?? null;
}

export function resolvePostImages(post: PostRecord): string[] {
  const rawImageUrls = post.image_urls as PostRecord["image_urls"] | string | null | undefined;
  if (Array.isArray(rawImageUrls) && rawImageUrls.length > 0) {
    return rawImageUrls.filter(Boolean) as string[];
  }
  if (typeof rawImageUrls === "string" && rawImageUrls.trim()) {
    const raw = rawImageUrls.trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean) as string[];
      }
    } catch {
      if (raw.startsWith("{") && raw.endsWith("}")) {
        return raw
          .slice(1, -1)
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((item) => item.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"'))
          .filter(Boolean);
      }
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  const single = post.image_url ?? post.image ?? null;
  return single ? [single] : [];
}

export function isMissingRelationError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "").toLowerCase()
      : "";
  return (
    message.includes("could not find the table") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

function isEnumPostCategoryError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "22P02" &&
    "message" in error &&
    String((error as { message?: unknown }).message || "").includes("post_category"),
  );
}

export async function createPostCompat(
  userId: string,
  content: string,
  imageUrl: string | null,
  options?: {
    imageUrls?: string[] | null;
    visibility?: "home" | "profile" | "home_only" | "feedback";
    status?: "published" | "pending";
    category?: "ons" | "fwb" | "dating" | "private" | "feedback" | "important" | "general";
    isAnonymous?: boolean;
    relationshipType?: string | null;
    province?: string | null;
    district?: string | null;
    /** Optional per-post contact links (Lucky Money v2 migration). */
    facebookUrl?: string | null;
    zaloUrl?: string | null;
  },
): Promise<{ id: string | null }> {
  // Restriction gate — throws + shows popup when user is blocked from posting.
  const { assertCanPost } = await import("@/services/restrictions.service");
  await assertCanPost();
  // Always re-fetch the authenticated user from Supabase — never trust an
  // id passed from local state, otherwise RLS will reject the insert with
  // "new row violates row-level security policy".
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  const authUserId = userData.user.id;
  if (userId && userId !== authUserId) {
    // Caller passed a stale id — fall back to the real auth id to satisfy RLS
    console.warn("createPostCompat: userId mismatch, using auth.uid() instead");
  }

  // Rate limit: 3 posts / 30s (backend is source of truth).
  if (!(await guardAction("post"))) {
    throw new Error("Bạn đang thao tác quá nhanh. Vui lòng đợi 5–10 giây rồi thử lại.");
  }

  // Moderation gate CHUNG: chặn nội dung dính từ cấm trước khi lưu.
  await assertContentAllowed(content || "", "post");
  // Quét bổ sung để gắn cờ "Không Phù Hợp" cho Admin (nội dung được lưu).
  const screening = await screenContent(content || "", "post");

  const imageUrls =
    options?.imageUrls && options.imageUrls.length > 0
      ? options.imageUrls
      : imageUrl
        ? [imageUrl]
        : null;
  const visibility = options?.visibility ?? "home";
  const status = options?.status ?? "published";
  const category = options?.category ?? "general";
  let dbCategory = category;
  const isAnonymous = !!options?.isAnonymous;
  const relationshipType = options?.relationshipType ?? null;
  const province = options?.province ?? null;
  const district = options?.district ?? null;

  // Try modern schema (image_urls + visibility). Fall back to legacy if columns
  // don't exist yet (migration not applied on external Supabase).
  const fullPayload: Record<string, any> = {
    user_id: authUserId,
    content,
    image_url: imageUrls?.[0] ?? null,
    image_urls: imageUrls,
    visibility,
    status,
    has_images: !!(imageUrls && imageUrls.length > 0),
    category: dbCategory,
    is_anonymous: isAnonymous,
  };
  if (relationshipType) fullPayload.relationship_type = relationshipType;
  if (province) fullPayload.province = province;
  if (district) fullPayload.district = district;
  if (options?.facebookUrl) fullPayload.facebook_url = options.facebookUrl;
  if (options?.zaloUrl) fullPayload.zalo_url = options.zaloUrl;
  let insertedId: string | null = null;
  let primary = await supabase.from("posts").insert([fullPayload as any]).select("id").single();
  let error: any = primary.error;
  if (!error) insertedId = (primary.data as any)?.id ?? null;
  // Retry: strip newly-added columns if the DB migration hasn't been run yet.
  const stripAndRetry = async (colRegex: RegExp, key: string) => {
    if (!error) return;
    if (!colRegex.test(error.message || "")) return;
    delete fullPayload[key];
    const retry = await supabase.from("posts").insert([fullPayload as any]).select("id").single();
    error = retry.error;
    if (!error) insertedId = (retry.data as any)?.id ?? null;
  };
  if (!error && insertedId) syncToS3("posts", { id: insertedId });
  await stripAndRetry(/column .*relationship_type.* does not exist/i, "relationship_type");
  await stripAndRetry(/column .*province.* does not exist/i, "province");
  await stripAndRetry(/column .*district.* does not exist/i, "district");
  await stripAndRetry(/column .*facebook_url.* does not exist/i, "facebook_url");
  await stripAndRetry(/column .*zalo_url.* does not exist/i, "zalo_url");

  if (error && isEnumPostCategoryError(error)) {
    throw new Error(
      `Database chưa hỗ trợ category '${category}'. Hãy chạy migration đồng bộ post_category trước khi đăng bài.`,
    );
  }
  if (error && (isMissingRelationError(error) || /column .* does not exist/i.test(error.message))) {
    // Fall back gradually: drop columns that don't exist.
    // CRITICAL: for feedback posts, ALWAYS keep category='feedback' on every
    // payload — losing it makes the post leak into the main feed.
    const isFeedback = dbCategory === "feedback" || visibility === "feedback";
    const tryPayloads: Record<string, any>[] = [
      {
        user_id: authUserId,
        content,
        image_url: imageUrls?.[0] ?? null,
        image_urls: imageUrls,
        visibility,
        status,
        category: dbCategory,
      },
      {
        user_id: authUserId,
        content,
        image_url: imageUrls?.[0] ?? null,
        image_urls: imageUrls,
        visibility,
        category: dbCategory,
      },
      isFeedback
        ? {
            user_id: authUserId,
            content,
            image_url: imageUrls?.[0] ?? null,
            image_urls: imageUrls,
            category: "feedback",
          }
        : {
            user_id: authUserId,
            content,
            image_url: imageUrls?.[0] ?? null,
            image_urls: imageUrls,
            visibility,
          },
      isFeedback
        ? {
            user_id: authUserId,
            content,
            image_url: imageUrls?.[0] ?? null,
            category: "feedback",
          }
        : { user_id: authUserId, content, image_url: imageUrls?.[0] ?? null },
    ];
    let lastErr = error;
    for (const p of tryPayloads) {
      const retry = await supabase.from("posts").insert([p as any]);
      if (!retry.error) {
        lastErr = null as any;
        break;
      }
      lastErr = retry.error;
    }
    error = lastErr;
  }

  if (error) {
    if (/row-level security/i.test(error.message)) {
      throw new Error("Không thể đăng bài: chính sách bảo mật từ chối. Hãy thử đăng nhập lại.");
    }
    throw new Error(error.message);
  }

  // Bot từ khoá: đánh dấu "Không Phù Hợp" (giữ nguyên bài để Admin xử lý).
  if (insertedId) await flagContentRecord("posts", insertedId, screening);

  // Ghi nhật ký hành vi đăng bài.
  void logActivity({
    userId: authUserId,
    actionType: "post_create",
    description: content
      ? `Bạn đã đăng bài viết mới: “${truncate(content, 80)}”.`
      : `Bạn đã đăng ${imageUrls && imageUrls.length > 0 ? "một bài viết có ảnh." : "một bài viết mới."}`,
    metadata: {
      has_images: !!(imageUrls && imageUrls.length > 0),
      category: dbCategory,
      preview: (content || "").slice(0, 120),
    },
  });

  return { id: insertedId };
}

/**
 * Đếm số bài người dùng đã đăng kể từ 00:00 hôm nay (theo giờ máy chủ Supabase / UTC).
 * Trả về số lượng bài Text-only và bài có ảnh để áp quota 1+1 / ngày.
 * Đếm tất cả status (kể cả pending / đã xoá vẫn không đếm vì đã không còn record;
 * spec yêu cầu "kể cả nếu user xoá bài, suất đăng vẫn được tính" — vì không có
 * bảng audit nên chúng ta đếm bằng record hiện có; xoá thực tế bị hạn chế bởi
 * UI: bài đã đăng không bị xoá tự động).
 */
export async function countTodayPosts(userId: string): Promise<{ text: number; image: number }> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  // Thử query có cột has_images
  const modern = await read3()
    .from("posts")
    .select("id, has_images, image_urls, image_url")
    .eq("user_id", userId)
    .gte("created_at", iso);

  if (modern.error) {
    return { text: 0, image: 0 };
  }
  let text = 0,
    image = 0;
  for (const row of modern.data ?? []) {
    const hasImg =
      (row as any).has_images === true ||
      (Array.isArray((row as any).image_urls) && (row as any).image_urls.length > 0) ||
      Boolean((row as any).image_url);
    if (hasImg) image += 1;
    else text += 1;
  }
  return { text, image };
}

export async function createMessageCompat(
  senderId: string,
  receiverId: string,
  content: string,
  imageUrl?: string | null,
  replyTo?: string | null,
) {
  // Restriction gate — throws + shows popup when user is blocked from messaging.
  const { assertCanMessage } = await import("@/services/restrictions.service");
  await assertCanMessage();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("Phiên đăng nhập đã hết hạn.");
  }
  const authUserId = userData.user.id;


  // Bảng `messages` schema tối giản: { sender_id, receiver_id, content, created_at }
  // reply_to là tuỳ chọn — nếu cột chưa tồn tại trong schema thì retry không kèm.
  // Rate limit chat sends: 5 msgs / 5s.
  if (!(await guardAction("chat"))) {
    throw new Error("Bạn đang thao tác quá nhanh. Vui lòng đợi 5–10 giây rồi thử lại.");
  }

  // Moderation gate CHUNG cho tin nhắn.
  await assertContentAllowed(content || "", "message");

  const base: Record<string, any> = {
    sender_id: authUserId,
    receiver_id: receiverId,
    content,
  };
  const payload = replyTo ? { ...base, reply_to: replyTo } : base;
  let { error } = await chatDb().from("messages").insert([payload]);
  if (error && replyTo && /reply_to/.test(error.message || "")) {
    ({ error } = await chatDb().from("messages").insert([base]));
  }
  if (error) throw new Error(error.message);
  void senderId;
  void imageUrl;
}

export interface DiceLogCompatRecord {
  id: string;
  bet: number;
  result: number;
  win: boolean;
  created_at: string | null;
}

interface CreateDiceLogCompatInput {
  bet: number;
  total: number;
  win: boolean;
  choice: "tai" | "xiu";
  delta: number;
  dice: [number, number, number];
}

export async function listDiceLogsCompat(userId: string, limit = 8) {
  const standardQuery = await logsDb()
    .from("dice_logs")
    .select("id, bet, result, win, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!standardQuery.error) {
    return ((standardQuery.data ?? []) as DiceLogCompatRecord[]).map((item) => ({
      id: item.id,
      bet: Number(item.bet || 0),
      result: Number(item.result || 0),
      win: Boolean(item.win),
      created_at: item.created_at,
    }));
  }

  const legacyQuery = await logsDb()
    .from("dice_logs")
    .select("id, bet_amount, total, won, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (legacyQuery.error) {
    throw new Error(legacyQuery.error.message);
  }

  return (legacyQuery.data ?? []).map((item: any) => ({
    id: item.id,
    bet: Number(item.bet_amount || 0),
    result: Number(item.total || 0),
    win: Boolean(item.won),
    created_at: item.created_at ?? null,
  }));
}

export async function createDiceLogCompat(userId: string, input: CreateDiceLogCompatInput) {
  if (!(await guardAction("bet"))) {
    throw new Error("Bạn đang thao tác quá nhanh. Vui lòng đợi 5–10 giây rồi thử lại.");
  }
  const [dice1, dice2, dice3] = input.dice;
  const tryPayloads = [
    { user_id: userId, bet: input.bet, result: input.total, win: input.win },
    {
      user_id: userId,
      session_id: `round-${Date.now()}`,
      bet_amount: input.bet,
      bet_choice: input.choice,
      dice1,
      dice2,
      dice3,
      total: input.total,
      result: input.choice,
      won: input.win,
      candy_change: input.delta,
    },
  ];
  let lastErr = "Không thể lưu lịch sử ván chơi.";
  for (const payload of tryPayloads) {
    const client = logsDb() as unknown as {
      from: (t: string) => {
        insert: (p: unknown[]) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await client.from("dice_logs").insert([payload]);
    if (!error) return;
    lastErr = error.message;
  }
  throw new Error(lastErr);
}
