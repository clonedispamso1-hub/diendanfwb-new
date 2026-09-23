/**
 * 🐟 Cá — tab Lịch sử Cá + "Xóa tất cả" lịch sử 5 mục (an toàn, không chạm ví).
 */
import { useState } from "react";
import { FishHistoryManager } from "@/components/admin-v3/wallet/FishHistoryManager";
import { PurgeAllButton } from "@/components/admin-v3/common/PurgeAllButton";
import { countFishHistory, fishCountRows, purgeFishHistory } from "@/lib/admin-purge-history";
import "@/styles/admin-stats-v4.css";

export function FishManager() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="sv4">
      <div className="sv4-head">
        <div>
          <h2 className="sv4-title">🐟 Cá</h2>
          <p className="sv4-sub">Lịch sử Cá — Nhận tiền & Rút tiền</p>
        </div>
        <div className="sv4-tools">
          <PurgeAllButton
            label="Xóa tất cả lịch sử"
            title="Xoá lịch sử 5 mục: Chuyển tiền · Rút tiền · Nhận tiền · Tặng quà · Nhận quà"
            count={async () => fishCountRows(await countFishHistory())}
            purge={purgeFishHistory}
            protectedNotes={[
              "Số dư ví (gem_balance) và sổ ví (gem_transactions)",
              "Tài khoản & dữ liệu đăng nhập của thành viên",
              "Quà chưa được nhận (tiền chưa vào ví)",
              "Đơn rút tiền đang chờ duyệt",
            ]}
            onDone={() => setReloadKey((k) => k + 1)}
          />
        </div>
      </div>

      <FishHistoryManager
        key={reloadKey}
        title="🐟 Lịch sử Cá"
        subtitle="Nhận tiền & Rút tiền của thành viên (chỉ xem)"
      />
    </div>
  );
}

export default FishManager;

