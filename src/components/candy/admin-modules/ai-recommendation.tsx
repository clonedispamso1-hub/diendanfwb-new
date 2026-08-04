import { ModuleShell } from "./module-shell";
export function AIRecommendation() {
  return (
    <ModuleShell title="AI Recommendation Engine" subtitle="Cấu hình thuật toán đề xuất & matching">
      <ul className="adm-empty" style={{ textAlign: "left", lineHeight: 1.8 }}>
        <li>• Ai được lên Explore (creator weight, freshness, engagement)</li>
        <li>• Matching algorithm: ưu tiên khu vực / tuổi / intent</li>
        <li>• Premium boost: account VIP được đẩy ưu tiên</li>
        <li>• Cold-start: bot kéo tương tác cho user mới</li>
        <li>• A/B test các trọng số thuật toán</li>
      </ul>
    </ModuleShell>
  );
}
