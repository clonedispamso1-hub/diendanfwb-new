/**
 * 🐟 Cá — chỉ giữ lại tab Rút Cá.
 */
import { WithdrawalRequestsManager } from "@/components/admin-v3/wallet/WithdrawalRequestsManager";
import "@/styles/admin-stats-v4.css";

export function FishManager() {
  return (
    <div className="sv4">
      <div className="sv4-head">
        <div>
          <h2 className="sv4-title">🐟 Cá</h2>
          <p className="sv4-sub">Rút Cá — chỉ tính thành viên thật</p>
        </div>
      </div>

      <WithdrawalRequestsManager
        realOnly
        title="🐟 Rút Cá"
        subtitle="Lịch sử & duyệt yêu cầu rút của thành viên thật"
      />
    </div>
  );
}

export default FishManager;

