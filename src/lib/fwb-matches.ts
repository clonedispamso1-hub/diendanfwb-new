// FWB two-way match system
import { supabase } from "@/integrations/supabase/client";
import { loadFwbFakeProfiles, type FakeProfileRecord } from "@/lib/fake-profiles";

const sb = supabase as unknown as any;

export type FwbCandidateKind = "real" | "demo";

export interface FwbCandidate {
  id: string;              // user id (real) hoặc fake_profile id (demo)
  kind: FwbCandidateKind;
  display_name: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_url: string | null;
  avatar?: string | null;
  province: string | null;
  bio: string | null;
  age: number | null;
  gender?: string | null;
  vip_level?: number | null;
}

/** Tải danh sách nearby — ưu tiên user thật cùng tỉnh, lân cận, sau đó demo. */
export async function loadNearbyFwbCandidates(opts: {
  meId: string;
  province: string | null;
  limit?: number;
  /** Giới tính của user hiện tại — dùng để LỌC NGƯỢC GIỚI. */
  meGender?: string | null;
}): Promise<FwbCandidate[]> {
  const { meId, province, limit = 30, meGender } = opts;

  /** Chỉ ghép NAM ↔ NỮ. Các giới tính khác sẽ không bị lọc cứng. */
  const oppositeGender =
    meGender === "male" ? "female" : meGender === "female" ? "male" : null;

  const applyBaseFilters = (q: any) => {
    q = q
      .neq("id", meId)
      .eq("is_fwb_active", true)
      .not("age", "is", null)
      .gte("age", 18);
    if (oppositeGender) q = q.eq("gender", oppositeGender);
    return q;
  };

  // 1) user thật cùng tỉnh
  let realSame: any[] = [];
  if (province) {
    const q = applyBaseFilters(
      sb.from("profiles").select("id, username, full_name, avatar, bio, province, age, gender, vip_level"),
    ).eq("province", province).limit(limit);
    const { data } = await q;
    realSame = data || [];
  }

  // 2) user thật tỉnh khác (nếu chưa đủ)
  let realOther: any[] = [];
  const remain1 = limit - (realSame?.length || 0);
  if (remain1 > 0) {
    let q = applyBaseFilters(
      sb.from("profiles").select("id, username, full_name, avatar, bio, province, age, gender, vip_level"),
    ).limit(remain1);
    if (province) q = q.neq("province", province);
    const { data } = await q;
    realOther = data || [];
  }


  // 3) Demo profiles (fake_profiles) — luôn lấy để mix, nhưng để cuối
  const demoRows: FakeProfileRecord[] = await loadFwbFakeProfiles({
    province,
    limit: Math.max(limit, 30),
  });

  const realCands: FwbCandidate[] = [...(realSame || []), ...realOther].map((p: any) => ({
    id: p.id,
    kind: "real",
    display_name: p.full_name || p.username,
    full_name: p.full_name,
    username: p.username,
    avatar_url: p.avatar,
    avatar: p.avatar,
    province: p.province,
    bio: p.bio,
    age: p.age ?? null,
    gender: p.gender,
    vip_level: p.vip_level,
  }));

  const demoCandsAll: FwbCandidate[] = demoRows.map((p) => ({
    id: p.id,
    kind: "demo",
    display_name: p.display_name || p.full_name || p.username,
    full_name: p.full_name,
    username: p.username,
    avatar_url: p.avatar_url || p.avatar,
    avatar: p.avatar,
    province: p.province,
    bio: p.bio,
    age: p.age ?? null,
    gender: p.gender,
    vip_level: p.vip_level,
  }));

  // Lọc demo theo NGƯỢC GIỚI tính. Nếu user không có gender → bỏ qua filter này.
  const genderMatchedDemoCands = oppositeGender
    ? demoCandsAll.filter((p) => (p.gender || "").toLowerCase() === oppositeGender)
    : demoCandsAll;
  const demoCands = genderMatchedDemoCands.length > 0 ? genderMatchedDemoCands : demoCandsAll;


  // Trộn: real đứng trước, xen kẽ nhẹ demo cho đỡ trống
  const out: FwbCandidate[] = [];
  let i = 0, j = 0;
  while (out.length < limit && (i < realCands.length || j < demoCands.length)) {
    // mỗi 2 real chèn 1 demo
    if (i < realCands.length) { out.push(realCands[i++]); }
    if (i < realCands.length) { out.push(realCands[i++]); }
    if (j < demoCands.length) { out.push(demoCands[j++]); }
  }
  if (out.length === 0 && demoCandsAll.length > 0) {
    return demoCandsAll.slice(0, limit);
  }
  return out.slice(0, limit);
}

/** Tỉ lệ demo accept khi gửi connection request — có thể chỉnh runtime. */
export const FWB_DEMO_ACCEPT_RATIO = 0.75;
/** Delay (ms) demo phản hồi: random 5–15s */
export function randomDemoDelayMs(): number {
  return 5000 + Math.floor(Math.random() * 10_000);
}

export interface ConnectionRequest {
  id: string;
  from_user: string;
  to_user: string | null;
  to_demo_id: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  responded_at: string | null;
}

/** Gửi yêu cầu kết nối ❤️. Trả về request id + matched (nếu đối phương từng gửi cho mình). */
export async function sendConnectionRequest(opts: {
  fromUser: string;
  candidate: FwbCandidate;
}): Promise<{ requestId: string | null; matchedNow: boolean; isDemo: boolean }> {
  const { fromUser, candidate } = opts;
  const isDemo = candidate.kind === "demo";

  const payload = isDemo
    ? { from_user: fromUser, to_user: null, to_demo_id: candidate.id, status: "pending" }
    : { from_user: fromUser, to_user: candidate.id, to_demo_id: null, status: "pending" };

  const { data, error } = await sb
    .from("connection_requests")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error && !/duplicate key|unique/i.test(error.message || "")) {
    console.warn("[fwb] sendConnectionRequest error:", error);
  }
  const requestId: string | null = data?.id ?? null;

  if (isDemo) return { requestId, matchedNow: false, isDemo: true };

  // Nếu đối phương đã gửi request cho mình trước đó & vẫn pending → tự động accept luôn (2 chiều).
  const { data: theirs } = await sb
    .from("connection_requests")
    .select("id, status")
    .eq("from_user", candidate.id)
    .eq("to_user", fromUser)
    .eq("status", "pending")
    .maybeSingle();

  if (theirs?.id) {
    await sb.from("connection_requests").update({ status: "accepted" }).eq("id", theirs.id);
    // Cũng accept request của mình để cả 2 đều thấy accepted
    if (requestId) {
      await sb.from("connection_requests").update({ status: "accepted" }).eq("id", requestId);
    }
    return { requestId, matchedNow: true, isDemo: false };
  }

  return { requestId, matchedNow: false, isDemo: false };
}

/** Người nhận accept/decline 1 yêu cầu kết nối. */
export async function respondToConnectionRequest(opts: {
  requestId: string;
  accept: boolean;
}): Promise<{ ok: boolean }> {
  const { requestId, accept } = opts;
  const { error } = await sb
    .from("connection_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId);
  if (error) {
    console.warn("[fwb] respondToConnectionRequest error:", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Lấy danh sách yêu cầu kết nối đang chờ mình trả lời. */
export async function listIncomingConnectionRequests(meId: string): Promise<ConnectionRequest[]> {
  const { data } = await sb
    .from("connection_requests")
    .select("id, from_user, to_user, to_demo_id, status, created_at, responded_at")
    .eq("to_user", meId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as ConnectionRequest[]) || [];
}

/** Đã match 2 chiều (accepted) chưa? Backward compat với legacy mutual-likes (fwb_likes). */
export async function isFwbMatched(meId: string, otherId: string): Promise<boolean> {
  if (!meId || !otherId || meId === otherId) return false;
  // Ưu tiên hệ thống mới
  const { data: accepted } = await sb.rpc("is_connection_accepted", { _a: meId, _b: otherId });
  if (accepted) return true;
  // Fallback legacy
  try {
    const { data } = await sb.rpc("fwb_is_matched", { _a: meId, _b: otherId });
    return !!data;
  } catch {
    return false;
  }
}

/** Backward compat alias cho code cũ */
export async function sendFwbLike(opts: {
  fromUser: string;
  candidate: FwbCandidate;
}): Promise<{ matched: boolean; isDemo: boolean }> {
  const r = await sendConnectionRequest(opts);
  return { matched: r.matchedNow, isDemo: r.isDemo };
}

