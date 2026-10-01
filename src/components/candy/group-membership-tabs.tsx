export type GroupMembershipTab = "vip" | "guide";

export function GroupMembershipTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: GroupMembershipTab;
  onTabChange: (tab: GroupMembershipTab) => void;
}) {

  return (
    <div className="messages-inbox__tabs" role="tablist" aria-label="Loại nhóm">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "vip"}
        className={`messages-inbox__tab${activeTab === "vip" ? " is-active" : ""}`}
        onClick={() => onTabChange("vip")}
      >
        Nhóm Miễn Phí
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "guide"}
        className={`messages-inbox__tab${activeTab === "guide" ? " is-active" : ""}`}
        onClick={() => onTabChange("guide")}
      >
        Lì Xì
      </button>
    </div>
  );
}
