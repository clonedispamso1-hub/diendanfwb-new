import { ModuleShell } from "./module-shell";
export function UserManagement() {
  return (
    <ModuleShell title="Quản lý User cực sâu" subtitle="Hồ sơ chi tiết + hành động nhanh">
      <ul className="adm-empty" style={{ textAlign: "left", lineHeight: 1.8 }}>
        <li>• Hồ sơ: IP, thiết bị, lịch sử đăng nhập, acc phụ liên quan</li>
        <li>• Số dư gem, hạn premium, lịch sử chat / report / giao dịch</li>
        <li>• Lịch sử đổi tên / avatar</li>
        <li>• Hành động: khóa chat, khóa đăng bài, shadowban, mute, kick session</li>
        <li>• Reset profile, fake verify (tích xanh ảo), cấp Premium</li>
        <li>• Cộng / trừ gem, đổi rank, ép logout toàn bộ thiết bị</li>
      </ul>
      <p className="adm-empty" style={{ marginTop: 12 }}>
        Vào tab <b>“Người dùng”</b> trong panel Admin gốc để thao tác tìm kiếm / khóa user hiện có.
      </p>
    </ModuleShell>
  );
}
