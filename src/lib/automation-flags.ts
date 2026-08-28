/**
 * CÔNG TẮC TỔNG AUTOMATION.
 *
 * Khi `AUTOMATION_ENABLED = false` (mặc định hiện tại):
 *  - Runner Auto-Post KHÔNG khởi động (kể cả khi DB ghi enabled = true).
 *  - Không tự gọi RPC, không polling, không retry, không scheduler/worker nền.
 *  - Các endpoint cron (/api/public/*-cron) trả 503 và không chạm database.
 *
 * Bật lại sau khi database ổn định: đổi giá trị này thành `true`.
 */
export const AUTOMATION_ENABLED = false;

/** Trạng thái automation an toàn: không đọc được DB ⇒ coi như OFF. */
export function automationAllowed(): boolean {
  return AUTOMATION_ENABLED;
}

export const AUTOMATION_DISABLED_MESSAGE =
  "Automation đang tắt toàn cục (chờ database ổn định).";
