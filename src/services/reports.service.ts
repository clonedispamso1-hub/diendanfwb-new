/**
 * Reports service.
 *
 * TODO(supabase): replace mock arrays with:
 *   supabase.from("reports").select(...).order("created_at", { ascending: false })
 */
import type { Report, ReportStatus, ServiceResult, UUID } from "./types";
import { delay, nowIso, uid } from "./_mock";

const mockReports: Report[] = [
  {
    id: uid(),
    reporter_id: uid(),
    target_type: "post",
    target_id: uid(),
    reason: "spam",
    details: "Repeated promotional content",
    status: "open",
    handled_by: null,
    handled_at: null,
    created_at: nowIso(),
  },
];

export const reportsService = {
  async list(filter?: { status?: ReportStatus }): Promise<Report[]> {
    await delay();
    return filter?.status
      ? mockReports.filter((r) => r.status === filter.status)
      : [...mockReports];
  },

  async get(id: UUID): Promise<Report | null> {
    await delay();
    return mockReports.find((r) => r.id === id) ?? null;
  },

  async updateStatus(
    id: UUID,
    status: ReportStatus,
  ): Promise<ServiceResult<Report>> {
    await delay();
    const report = mockReports.find((r) => r.id === id);
    if (!report) return { ok: false, error: "not_found" };
    report.status = status;
    report.handled_at = nowIso();
    return { ok: true, data: report };
  },

  async remove(id: UUID): Promise<ServiceResult> {
    await delay();
    const i = mockReports.findIndex((r) => r.id === id);
    if (i >= 0) mockReports.splice(i, 1);
    return { ok: true };
  },
};
