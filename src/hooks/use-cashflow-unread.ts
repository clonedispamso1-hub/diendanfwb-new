/**
 * 🔴 Badge / chấm đỏ REALTIME cho "Lịch sử dòng tiền".
 *
 * - KHÔNG tạo bảng mới, KHÔNG đổi Supabase URL/API, KHÔNG sửa dữ liệu cũ.
 * - Mốc "đã đọc" của từng tab lưu ở localStorage theo user (client-side).
 * - Cập nhật realtime bằng Supabase Realtime (postgres_changes) — KHÔNG polling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type CfSection = "withdraw" | "transfer_out" | "transfer_in";

export const CF_SECTIONS: CfSection[] = ["withdraw", "transfer_out", "transfer_in"];

type SeenMap = Record<CfSection, number>;

const EMPTY_SEEN: SeenMap = { withdraw: 0, transfer_out: 0, transfer_in: 0 };

const storageKey = (uid: string) => `cf:seen:v1:${uid}`;

function readSeen(uid: string | null): SeenMap {
  if (!uid || typeof window === "undefined") return EMPTY_SEEN;
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return EMPTY_SEEN;
    const parsed = JSON.parse(raw) as Partial<Record<CfSection, number>>;
    return {
      withdraw: Number(parsed.withdraw ?? 0) || 0,
      transfer_out: Number(parsed.transfer_out ?? 0) || 0,
      transfer_in: Number(parsed.transfer_in ?? 0) || 0,
    };
  } catch {
    return EMPTY_SEEN;
  }
}

function writeSeen(uid: string, next: SeenMap) {
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(next));
  } catch {
    /* localStorage có thể bị chặn — bỏ qua */
  }
}

type MinimalRow = { kind: CfSection | string; created_at: string };

export function useCashFlowUnread({
  uid,
  rows,
  reload,
}: {
  uid: string | null;
  rows: MinimalRow[];
  reload: () => void;
}) {
  const [seen, setSeen] = useState<SeenMap>(EMPTY_SEEN);

  useEffect(() => {
    setSeen(readSeen(uid));
  }, [uid]);

  /** Thời điểm giao dịch mới nhất của từng tab. */
  const latest = useMemo(() => {
    const out: SeenMap = { ...EMPTY_SEEN };
    for (const r of rows) {
      const k = r.kind as CfSection;
      if (!CF_SECTIONS.includes(k)) continue;
      const t = new Date(r.created_at).getTime();
      if (Number.isFinite(t) && t > out[k]) out[k] = t;
    }
    return out;
  }, [rows]);

  const unread = useMemo(
    () => ({
      withdraw: latest.withdraw > seen.withdraw,
      transfer_out: latest.transfer_out > seen.transfer_out,
      transfer_in: latest.transfer_in > seen.transfer_in,
    }),
    [latest, seen],
  );

  const anyUnread = unread.withdraw || unread.transfer_out || unread.transfer_in;

  /** Người dùng đã xem tab này → tắt chấm đỏ. */
  const markSeen = useCallback(
    (section: CfSection) => {
      if (!uid) return;
      const mark = Math.max(latest[section], Date.now());
      setSeen((prev) => {
        if (prev[section] >= mark) return prev;
        const next = { ...prev, [section]: mark } as SeenMap;
        writeSeen(uid, next);
        return next;
      });
    },
    [uid, latest],
  );

  /* ---------------- Realtime: không polling ---------------- */
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!uid) return;
    const fire = () => reloadRef.current();
    const ch = (supabase as any)
      .channel(`cashflow:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${uid}` },
        fire,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transfer_transactions", filter: `sender_id=eq.${uid}` },
        fire,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transfer_transactions", filter: `receiver_id=eq.${uid}` },
        fire,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gem_transactions", filter: `sender_id=eq.${uid}` },
        fire,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gem_transactions", filter: `receiver_id=eq.${uid}` },
        fire,
      )
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [uid]);

  return { unread, anyUnread, markSeen };
}
