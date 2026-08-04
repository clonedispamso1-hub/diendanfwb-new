/** PHASE 3.8 — Skeleton shimmer cho Nearby. */
export function NearbyCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-3xl border bg-card p-4">
      <div className="flex gap-4">
        <div className="h-20 w-20 shrink-0 rounded-2xl bg-muted" />
        <div className="flex-1 space-y-2.5 py-1">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
          <div className="flex gap-1.5">
            <div className="h-5 w-14 rounded-full bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-9 flex-1 rounded-full bg-muted" />
        <div className="h-9 flex-1 rounded-full bg-muted" />
      </div>
      <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent dark:via-white/5" />
    </div>
  );
}

export function NearbyEmptyState({ onReset }: { onReset?: () => void }) {
  return (
    <div className="mx-auto max-w-sm rounded-3xl border bg-gradient-to-b from-rose-500/5 to-fuchsia-500/5 p-8 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-500 text-3xl shadow-lg shadow-rose-500/30">
        💞
      </div>
      <h3 className="mt-4 text-base font-bold">Chưa có ai phù hợp</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Hãy mở rộng bán kính tìm kiếm hoặc nới lỏng bộ lọc để khám phá thêm thành viên thú vị quanh bạn.
      </p>
      {onReset ? (
        <button
          onClick={onReset}
          className="mt-4 rounded-full bg-foreground px-5 py-2 text-xs font-semibold text-background"
        >
          Đặt lại bộ lọc
        </button>
      ) : null}
    </div>
  );
}
