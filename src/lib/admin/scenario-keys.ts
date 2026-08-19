// Query keys + đồng bộ tức thời cho hệ thống Kịch Bản (Up Bài / Bình Luận / Theo Dõi).
// Nguyên tắc: KHÔNG cache lâu, KHÔNG giữ dữ liệu trong useState — mọi thao tác
// (tạo / sửa / xóa / pause / resume / chạy / purge / clear) đều gọi useScenarioSync()
// để invalidate toàn bộ nhánh "scenario" → UI cập nhật ngay, không cần F5.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const scenarioKeys = {
  all: ["scenario"] as const,
  posts: () => ["scenario", "posts"] as const,
  days: () => ["scenario", "days"] as const,
  runs: () => ["scenario", "runs"] as const,
  tasks: (jobId: string | null) => ["scenario", "tasks", jobId] as const,
  commentJobs: () => ["scenario", "comment", "jobs"] as const,
  commentTasks: (jobId: string | null) => ["scenario", "comment", "tasks", jobId] as const,
  commentTexts: () => ["scenario", "comment", "texts"] as const,
  commentSources: () => ["scenario", "comment", "sources"] as const,
  followTasks: () => ["scenario", "follow", "tasks"] as const,
};

/** Cấu hình chung: cache 10 phút, không tự refetch — chỉ đồng bộ qua useScenarioSync(). */
export const SCENARIO_QUERY_OPTIONS = {
  staleTime: 10 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 1,
} as const;

/** Invalidate + refetch toàn bộ dữ liệu Kịch Bản đang hiển thị. */
export function useScenarioSync() {
  const qc = useQueryClient();
  return useCallback(
    async () => {
      await qc.invalidateQueries({ queryKey: scenarioKeys.all, refetchType: "all" });
    },
    [qc],
  );
}
