/**
 * Màn hình khóa truy cập — giao diện tĩnh kiểu 404.
 * Không nút quay lại, không điều hướng, không gọi backend.
 * Logo đọc từ cache của nguồn duy nhất (SiteSettings.logo_url), không gọi backend.
 */
import { SiteLogo } from "@/components/candy/site-logo";

export function BlockedScreen(_props: { info?: unknown }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <SiteLogo
          scale={1.15}
          alt="Logo website"
          className="mx-auto mb-6"
          priority
        />
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Tài khoản của bạn đã bị khóa
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Lý do:
          <br />
          Vi phạm điều khoản sử dụng của Diễn Đàn FWB.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Nếu cho rằng đây là nhầm lẫn vui lòng liên hệ quản trị viên.
        </p>
      </div>
    </main>
  );
}
