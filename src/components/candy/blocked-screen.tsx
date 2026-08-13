import { ShieldOff } from "lucide-react";
import type { GateResult } from "@/lib/access-guard";
import { SiteLogo } from "@/components/candy/site-logo";

/**
 * Màn 403 tối giản — không avatar, không badge, không card lớn.
 * Chỉ hiển thị; không gọi backend, không thay đổi logic khóa.
 */
export function BlockedScreen({ info }: { info?: GateResult | null }) {
  const reason = info?.reason ?? null;

  return (
    <main className="blocked-403">
      <SiteLogo size={56} className="blocked-403__logo" alt="Logo website" />
      <ShieldOff className="blocked-403__icon" aria-hidden="true" />
      <h1 className="blocked-403__title">Tài khoản hoặc thiết bị đã bị cấm truy cập</h1>
      <p className="blocked-403__desc">
        Quyền truy cập vào trang web này đã bị chặn. Vui lòng liên hệ Ban quản trị nếu bạn cho rằng
        đây là nhầm lẫn.
      </p>
      <p className="blocked-403__code">403 — Access Denied</p>
      {reason ? <p className="blocked-403__reason">Mã: {reason}</p> : null}
      <button type="button" className="blocked-403__btn" onClick={() => window.history.back()}>
        Quay lại
      </button>
    </main>
  );
}

export default BlockedScreen;
