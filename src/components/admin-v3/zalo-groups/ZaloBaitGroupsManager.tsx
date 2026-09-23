import { useState } from "react";
import { FileText, List, MessageSquare, MessagesSquare } from "lucide-react";
import { CountryFlag, type CountryFlagId } from "@/components/candy/zalo-country-flags";
import { ZaloSubItemsL1Manager } from "@/components/admin-v3/zalo-groups/ZaloSubItemsL1Manager";

type WorkspaceTab = "list" | "messages" | "posts" | "comments";

const COUNTRIES: Array<{ id: CountryFlagId; label: string }> = [
  { id: "vn", label: "VIP ZALO VIỆT NAM" },
  { id: "tw", label: "VIP ZALO ĐÀI LOAN" },
  { id: "jp", label: "VIP ZALO NHẬT BẢN" },
];

const WORKSPACE_TABS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: typeof List;
}> = [
  { id: "list", label: "Danh sách", icon: List },
  { id: "messages", label: "Tin nhắn", icon: MessageSquare },
  { id: "posts", label: "Đăng bài", icon: FileText },
  { id: "comments", label: "Bình luận hàng loạt", icon: MessagesSquare },
];

const PLACEHOLDERS: Record<Exclude<WorkspaceTab, "list">, { title: string; description: string }> = {
  messages: {
    title: "Quản lý tin nhắn",
    description: "Khu vực quản lý tin nhắn sẽ được hoàn thiện ở bước tiếp theo.",
  },
  posts: {
    title: "Đăng bài",
    description: "Khu vực đăng bài sẽ được hoàn thiện ở bước tiếp theo.",
  },
  comments: {
    title: "Bình luận hàng loạt",
    description: "Khu vực bình luận hàng loạt sẽ được hoàn thiện ở bước tiếp theo.",
  },
};

function EmptyWorkspace({ tab, country }: { tab: Exclude<WorkspaceTab, "list">; country: string }) {
  const Icon = WORKSPACE_TABS.find((item) => item.id === tab)?.icon ?? FileText;
  const content = PLACEHOLDERS[tab];
  return (
    <section className="admv3-card flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="grid size-12 place-items-center rounded-lg border bg-muted text-muted-foreground">
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 className="m-0 text-base font-semibold">{content.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{country}</p>
      </div>
      <p className="m-0 max-w-md text-sm text-muted-foreground">{content.description}</p>
      <span className="rounded-md border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Chưa triển khai thao tác
      </span>
    </section>
  );
}

export function ZaloBaitGroupsManager() {
  const [countryId, setCountryId] = useState<CountryFlagId>("vn");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("list");
  const activeCountry = COUNTRIES.find((country) => country.id === countryId) ?? COUNTRIES[0];

  return (
    <div className="admv3-page">
      <header className="admv3-page-header">
        <div>
          <h2 className="admv3-page-title">Nhóm Zalo Mồi</h2>
          <p className="admv3-page-sub">Quản lý riêng cấu trúc nội dung của từng quốc gia.</p>
        </div>
      </header>

      <div className="admv3-card overflow-hidden p-2">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Quốc gia">
          {COUNTRIES.map((country) => {
            const active = country.id === countryId;
            return (
              <button
                key={country.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-center text-xs font-semibold leading-snug transition-colors sm:min-h-14 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
                onClick={() => setCountryId(country.id)}
              >
                <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-background">
                  <CountryFlag id={country.id} />
                </span>
                <span className="min-w-0 break-words">{country.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b">
        <div className="grid grid-cols-2 gap-1 pb-2 sm:grid-cols-4" role="tablist" aria-label="Chức năng quản lý">
          {WORKSPACE_TABS.map((item) => {
            const Icon = item.icon;
            const active = item.id === workspaceTab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 text-center text-sm font-semibold leading-snug transition-colors sm:px-3 ${
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setWorkspaceTab(item.id)}
              >
                <Icon size={15} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {workspaceTab === "list" ? (
        <ZaloSubItemsL1Manager key={countryId} countryId={countryId} />
      ) : (
        <EmptyWorkspace tab={workspaceTab} country={activeCountry.label} />
      )}
    </div>
  );
}

export default ZaloBaitGroupsManager;
