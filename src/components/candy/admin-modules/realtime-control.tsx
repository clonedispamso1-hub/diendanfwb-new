import { ModuleShell, StatCard } from "./module-shell";
export function RealtimeControl() {
  return (
    <ModuleShell title="Realtime Control Center" subtitle="Giám sát tải hệ thống & phát hiện tấn công">
      <div className="adm-stats-grid">
        <StatCard label="Online realtime" value="—" tone="good" />
        <StatCard label="Server load" value="—" hint="CPU/RAM avg" />
        <StatCard label="Chat / giây" value="—" />
        <StatCard label="Post / giây" value="—" />
        <StatCard label="Spam attack" value="0" tone="good" hint="Phát hiện wave đột biến" />
        <StatCard label="Login fail/phút" value="—" tone="warn" />
      </div>
    </ModuleShell>
  );
}
