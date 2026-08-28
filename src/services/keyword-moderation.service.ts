/**
 * Keyword moderation — gom vi phạm từ khoá theo TÀI KHOẢN.
 *
 * Nguồn dữ liệu: public.keyword_logs trên Supabase #3 (DB logs/social).
 * Ưu tiên RPC `admin_keyword_offenders` (SECURITY DEFINER). Nếu DB chưa chạy
 * migration thì tự gom ở client từ keyword_logs để UI vẫn hoạt động.
 */
import { socialDb } from "@/services/database";

export interface KeywordViolation {
  id: number | string;
  user_id: string;
  username: string | null;
  content: string;
  matched_keyword: string;
  penalty: number;
  severity: string | null;
  context_type: string | null;
  created_at: string;
}

export interface KeywordOffender {
  user_id: string;
  username: string | null;
  violations: number;
  last_at: string | null;
  last_keyword: string | null;
}

const LOG_COLS =
  "id, user_id, username, content, matched_keyword, penalty, created_at, context_type, severity";

function isMissing(error: any): boolean {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42883" ||
    msg.includes("could not find")
  );
}

export const keywordModerationService = {
  /** Danh sách tài khoản vi phạm, sắp xếp theo số lần vi phạm. */
  async listOffenders(limit = 100): Promise<KeywordOffender[]> {
    const db = socialDb() as any;
    const { data, error } = await db.rpc("admin_keyword_offenders", { _limit: limit });
    if (!error && Array.isArray(data)) {
      return (data as KeywordOffender[]).map((o) => ({
        ...o,
        violations: Number(o.violations ?? 0),
      }));
    }
    if (error && !isMissing(error)) throw error;

    // Fallback: gom ở client.
    const { data: logs, error: logErr } = await db
      .from("keyword_logs")
      .select(LOG_COLS)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (logErr) {
      if (isMissing(logErr)) return [];
      throw logErr;
    }
    const map = new Map<string, KeywordOffender>();
    for (const l of (logs ?? []) as KeywordViolation[]) {
      const cur = map.get(l.user_id);
      if (cur) {
        cur.violations += 1;
        if (!cur.username && l.username) cur.username = l.username;
      } else {
        map.set(l.user_id, {
          user_id: l.user_id,
          username: l.username ?? null,
          violations: 1,
          last_at: l.created_at,
          last_keyword: l.matched_keyword,
        });
      }
    }
    return [...map.values()]
      .sort((a, b) => b.violations - a.violations)
      .slice(0, limit);
  },

  /** Toàn bộ vi phạm của 1 tài khoản (nội dung, từ khoá, thời gian). */
  async listViolations(userId: string, limit = 100): Promise<KeywordViolation[]> {
    const db = socialDb() as any;
    const { data, error } = await db
      .from("keyword_logs")
      .select(LOG_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    return (data ?? []) as KeywordViolation[];
  },
};

export type KeywordModerationService = typeof keywordModerationService;
