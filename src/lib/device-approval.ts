/**
 * Device Signup Approval — mỗi thiết bị tự động kích hoạt 01 tài khoản.
 *
 * • Tài khoản đầu tiên trên thiết bị (fingerprint + cookie) → approved ngay.
 * • Tài khoản thứ 2 trở đi → pending, chờ Admin phê duyệt (KHÔNG bị khóa).
 * • Admin KHÔNG được miễn trừ (Admin cũng chỉ 1 tài khoản/thiết bị).
 * • Clone / seed / tài khoản ảo (tạo từ "Tài khoản thứ hai") → miễn duyệt.
 * • Auto Approve chạy nền bằng pg_cron trên database, không phụ thuộc client.
 */
import { supabase } from "@/lib/db/router";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { getDeviceCookieId } from "@/lib/device-signal";

export type ApprovalStatus = "approved" | "pending" | "rejected";

export interface ApprovalInfo {
  status: ApprovalStatus;
  seq: number;
  admin: boolean;
  reason?: string | null;
  /** Link liên hệ Admin (cấu hình trong Quản lý thành viên → Duyệt tài khoản). */
  contact?: string | null;
}

export interface DeviceApprovalSettings {
  auto_approve: boolean;
  auto_approve_minutes: number;
  admin_contact_link: string;
}

const OPEN: ApprovalInfo = { status: "approved", seq: 1, admin: false };

const sb = supabase as any;

function normalize(raw: any): ApprovalInfo {
  if (!raw || typeof raw !== "object") return OPEN;
  const status = raw.status === "pending" || raw.status === "rejected" ? raw.status : "approved";
  return {
    status,
    seq: Number(raw.seq ?? 1) || 1,
    admin: raw.admin === true,
    reason: raw.reason ?? null,
    contact: raw.contact ?? null,
  };
}

/** Ghi nhận thiết bị cho tài khoản vừa đăng ký. Fail-open (lỗi → approved). */
export async function claimDeviceSignup(): Promise<ApprovalInfo> {
  if (typeof window === "undefined") return OPEN;
  try {
    const { data, error } = await sb.rpc("claim_device_signup", {
      p_fingerprint: getDeviceFingerprint(),
      p_cookie_id: getDeviceCookieId(),
    });
    if (error) return OPEN;
    return normalize(data);
  } catch {
    return OPEN;
  }
}

/** Đọc trạng thái phê duyệt của chính mình. Fail-open. */
export async function fetchMyApproval(): Promise<ApprovalInfo> {
  if (typeof window === "undefined") return OPEN;
  try {
    const { data, error } = await sb.rpc("my_approval_status");
    if (error) return OPEN;
    return normalize(data);
  } catch {
    return OPEN;
  }
}

const DEFAULT_SETTINGS: DeviceApprovalSettings = {
  auto_approve: false,
  auto_approve_minutes: 1,
  admin_contact_link: "",
};

/** Cấu hình Auto Approve + link liên hệ Admin (đọc được cho mọi người dùng). */
export async function fetchApprovalSettings(): Promise<DeviceApprovalSettings> {
  try {
    const { data, error } = await sb.rpc("device_approval_settings");
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      auto_approve: data.auto_approve === true,
      auto_approve_minutes: Math.max(1, Number(data.auto_approve_minutes ?? 1) || 1),
      admin_contact_link: String(data.admin_contact_link ?? ""),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Admin: lưu cấu hình Auto Approve + link liên hệ. */
export async function saveApprovalSettings(
  input: DeviceApprovalSettings,
): Promise<DeviceApprovalSettings> {
  const { data, error } = await sb.rpc("admin_set_device_approval_settings", {
    p_auto: input.auto_approve,
    p_minutes: Math.max(1, Number(input.auto_approve_minutes) || 1),
    p_link: input.admin_contact_link ?? "",
  });
  if (error) throw error;
  return {
    auto_approve: data?.auto_approve === true,
    auto_approve_minutes: Math.max(1, Number(data?.auto_approve_minutes ?? 1) || 1),
    admin_contact_link: String(data?.admin_contact_link ?? ""),
  };
}

/** Dọn các tài khoản pending quá 24h (gọi rời rạc, không polling). */
export async function purgeStalePendingAccounts(): Promise<void> {
  try {
    await sb.rpc("purge_stale_pending_accounts");
  } catch {
    /* ignore */
  }
}
