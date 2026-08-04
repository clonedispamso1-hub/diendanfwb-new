import { ModuleShell } from "./module-shell";
export function ShadowSystem() {
  return (
    <ModuleShell title="Shadow System (Tối mật)" subtitle="Shadowban user vi phạm mà họ không hay biết">
      <ul className="adm-empty" style={{ textAlign: "left", lineHeight: 1.8 }}>
        <li>• User vẫn đăng bài, vẫn chat bình thường</li>
        <li>• Hệ thống ẩn hoặc giảm reach tuyệt đối</li>
        <li>• Người khác không thấy nội dung của họ</li>
        <li>• Có thể bật theo: post / chat / explore / follow</li>
        <li>• Logged ngầm trong Audit để admin khác đối chiếu</li>
      </ul>
    </ModuleShell>
  );
}
