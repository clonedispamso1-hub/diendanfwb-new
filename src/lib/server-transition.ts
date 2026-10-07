import { SEVER_PHASE_DURATION_MS } from "./sever-timing";

export const SERVER_TRANSITION_DURATION_MS = SEVER_PHASE_DURATION_MS;

export const SERVER_TRANSITION_STATUSES = [
  { at: 0, label: "🌐 Đang chuyển khu vực..." },
  { at: 3_000, label: "🔄 Đang kết nối server..." },
  { at: 6_000, label: "📡 Đang đồng bộ khu vực..." },
  { at: 9_000, label: "🌍 Hoàn tất kết nối..." },
] as const;

export function shouldReturnToMixedOnClose(serverId: string, hasVipAccess: boolean): boolean {
  return serverId !== "mixed" && !hasVipAccess;
}