import { ModuleShell } from "./module-shell";
export function EventGamification() {
  return (
    <ModuleShell title="Event & Gamification" subtitle="Vòng quay, nhiệm vụ ngày, checkin, leaderboard">
      <ul className="adm-empty" style={{ textAlign: "left", lineHeight: 1.8 }}>
        <li>• Tạo event theo lịch (start/end, thưởng gem)</li>
        <li>• Vòng quay may mắn — cấu hình tỉ lệ</li>
        <li>• Nhiệm vụ ngày: chat 10 người → nhận gem</li>
        <li>• Checkin liên tục — chuỗi thưởng</li>
        <li>• Leaderboard top tương tác / nạp / đăng bài</li>
      </ul>
    </ModuleShell>
  );
}
