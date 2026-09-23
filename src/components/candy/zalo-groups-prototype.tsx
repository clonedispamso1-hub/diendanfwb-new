/**
 * ZaloGroupsPrototype — Popup mở khi bấm icon Zalo nổi ở Trang Chủ.
 *
 * CẤP 1 (hiện tại): menu 5 quốc gia — mỗi quốc gia 1 card với quốc kỳ vẽ SVG
 * trong avatar, tên + subtitle, mũi tên → bên phải. KHÔNG còn danh sách nhóm.
 * CẤP 2: nội dung theo từng quốc gia — sẽ triển khai sau, chưa thuộc lần này.
 *
 * Giữ nguyên: ModalFrame (glass tím–hồng), nút X đóng, khoá scroll, Escape,
 * icon Zalo nổi ở Trang Chủ và mọi phần khác của website.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, KeyRound, Lock, MapPin, Mars, Users, Venus, X } from "lucide-react";
import { listZaloAreaGroups, type ZaloAreaGroup } from "@/lib/zalo-area-groups";
import { resolveProvince } from "@/lib/vn-locations";
import { Portal } from "@/components/candy/portal";
import { Zalo3DIcon } from "@/components/candy/zalo-3d-icon";
import { CountryFlag, type CountryFlagId } from "@/components/candy/zalo-country-flags";
import { useZaloCountryCards } from "@/lib/zalo-country-cards";
import { useZaloFloatIcon } from "@/lib/zalo-float-icon";
import { listZaloSubItems, type ZaloSubItemL1 } from "@/lib/zalo-sub-items";
import { listZaloSubItemsL2, type ZaloSubItemL2 } from "@/lib/zalo-sub-items-l2";
import { hasLocationToken, resolveLocationName } from "@/lib/zalo-location-areas";
import { useZaloUserAreas } from "@/hooks/use-zalo-user-areas";
import { useAuth } from "@/components/candy/auth-provider";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";

/** Popup cấp 1 ở z=100000; popup cấp 2 (theo quốc gia) đè lên ở z cao hơn. */
const POPUP1_Z = 100000;
const POPUP2_Z = POPUP1_Z + 10;
/** Popup cấp 3 — danh sách nhóm của ĐÚNG một khu vực. */
const POPUP3_Z = POPUP2_Z + 10;

function ModalFrame({
  title,
  subtitle,
  onClose,
  zIndex = POPUP1_Z,
  fitContent = false,
  vipCountryMenu = false,
  headerIcon,
  children,
}: {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  zIndex?: number;
  /** true: popup chỉ cao vừa nội dung (mobile), tối đa 78dvh. */
  fitContent?: boolean;
  vipCountryMenu?: boolean;
  headerIcon?: ReactNode;
  children: ReactNode;
}) {
  const { settings: popupIcon } = useZaloFloatIcon();
  return (
    <div
      className="zg-overlay fixed inset-0 grid h-[100dvh] w-screen touch-none place-items-center overflow-hidden px-[4vw] py-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Nhóm Zalo"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`zg-modal zg-flow-premium ${vipCountryMenu ? "zg-vip-country-modal" : ""} relative flex ${fitContent ? "h-auto max-h-[78dvh]" : "h-[78dvh] max-h-[760px]"} w-[92vw] max-w-md touch-auto flex-col overflow-hidden sm:h-auto`}
      >
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className={`zg-close absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center text-foreground ${vipCountryMenu ? "zg-vip-country-close" : "rounded-full"}`}
        >
          <X size={20} />
        </button>
        {title ? (
          <header className={`zg-header shrink-0 px-6 pb-5 pt-6 text-left ${vipCountryMenu ? "zg-vip-country-header" : ""}`}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_44px] items-center gap-3.5">
              <span className="zg-vip-country-logo" aria-hidden="true">
                {headerIcon ?? (popupIcon.image_url ? (
                  <img src={popupIcon.image_url} alt="" className="block h-full w-full object-contain" draggable={false} />
                ) : <Zalo3DIcon className="block h-full w-full" />)}
              </span>
              <span className="min-w-0">
                <h2 className={`truncate text-[22px] font-extrabold text-foreground ${vipCountryMenu ? "zg-vip-country-title" : "tracking-tight"}`}>
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-muted-foreground">
                    {subtitle}
                  </p>
                ) : null}
              </span>
              <span aria-hidden="true" />
            </div>
          </header>
        ) : null}
        {children}
      </section>
    </div>
  );
}

/**
 * Một mục lớp 1 trong popup cấp 2.
 * Mục chứa {LOCATION}: hiển thị tên theo tỉnh/thành user đã đăng ký +
 * danh sách khu vực CỐ ĐỊNH đọc từ hàm dùng chung (không random ở đây).
 */
function SubItemRow({
  item,
  countryId,
  userId,
  userProvince,
}: {
  item: ZaloSubItemL1;
  countryId: CountryFlagId;
  userId?: string | null;
  userProvince?: string | null;
}) {
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<ZaloSubItemL2 | null>(null);
  const isLocationItem = hasLocationToken(item.name);
  const title = resolveLocationName(item.name, userProvince);
  // Hook chỉ chạy khi đây là mục {LOCATION} và user đã có tỉnh/thành.
  const areasQuery = useZaloUserAreas({
    userId: isLocationItem ? userId : null,
    itemId: isLocationItem ? item.id : null,
    location: isLocationItem ? userProvince : null,
    areaLimit: item.area_limit ?? 0,
  });
  const areas = areasQuery.data ?? [];

  // Mục lớp 1 KHÔNG theo tỉnh/thành → hiển thị các mục lớp 2 đang BẬT.
  const subItemsL2Query = useQuery({
    queryKey: ["zalo-sub-items-l2", item.id],
    queryFn: () => listZaloSubItemsL2(item.id, { onlyEnabled: true }),
    enabled: !isLocationItem,
    staleTime: 60 * 1000,
  });
  const subItemsL2 = subItemsL2Query.data ?? [];

  return (
    <div className="zg-card w-full rounded-[22px] px-3 py-3 text-left">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span className="zg-avatar-ring relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full p-[2px]">
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white ring-2 ring-card">
            {item.image_url ? (
              <img src={item.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Zalo3DIcon className="h-9 w-9 block" />
            )}
          </span>
        </span>
        <span className="min-w-0">
          <strong className="block min-w-0 truncate text-[14.5px] font-extrabold leading-tight tracking-tight text-foreground">
            {title}
          </strong>
          {item.subtitle ? (
            <span className="mt-0.5 block min-w-0 truncate text-[11.5px] font-semibold text-muted-foreground">
              {item.subtitle}
            </span>
          ) : null}
        </span>
      </div>
      {isLocationItem ? (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          {areasQuery.isLoading ? (
            <p className="text-[12px] font-semibold text-muted-foreground">Đang tải khu vực…</p>
          ) : areas.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Khu vực của bạn">
              {areas.map((area) => (
                <li key={area}>
                  <button
                    type="button"
                    onClick={() => setActiveArea(area)}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11.5px] font-bold text-violet-600 ring-1 ring-violet-400/25 transition-colors hover:bg-violet-500/20 dark:text-violet-300"
                  >
                    <MapPin size={11} strokeWidth={2.5} aria-hidden="true" />
                    {area}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] font-semibold text-muted-foreground">
              Chưa có khu vực cho tỉnh/thành của bạn.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          {subItemsL2Query.isLoading ? (
            <p className="text-[12px] font-semibold text-muted-foreground">Đang tải mục…</p>
          ) : subItemsL2.length > 0 ? (
            <ul className="grid gap-2" aria-label={`Các nhóm của ${title}`}>
              {subItemsL2.map((sub) => (
                <li key={sub.id}>
                  {/* CARD NHÓM: avatar + tên + tổng thành viên — bấm mở popup chi tiết */}
                  <button
                    type="button"
                    onClick={() => setActiveL2(sub)}
                    className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[18px] bg-violet-500/5 px-2.5 py-2 text-left ring-1 ring-violet-400/20 transition-colors hover:bg-violet-500/10"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-violet-400/25">
                      {sub.image_url ? (
                        <img src={sub.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Zalo3DIcon className="h-8 w-8 block" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <strong className="block min-w-0 truncate text-[13px] font-extrabold leading-tight text-foreground">
                        {sub.name}
                      </strong>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <Users size={11} strokeWidth={2.5} aria-hidden="true" />
                        <span className="tabular-nums">{sub.member_count} thành viên</span>
                      </span>
                    </span>
                    <span
                      className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-violet-500 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-violet-300"
                      aria-hidden="true"
                    >
                      <ArrowRight size={16} strokeWidth={2.5} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] font-semibold text-muted-foreground">
              Mục này chưa có nội dung.
            </p>
          )}
        </div>
      )}
      {activeArea ? (
        <AreaGroupsModal
          countryId={countryId}
          itemId={item.id}
          province={resolveProvince(String(userProvince ?? "")) || String(userProvince ?? "")}
          area={activeArea}
          onClose={() => setActiveArea(null)}
        />
      ) : null}
      {activeL2 ? (
        <GroupDetailModal
          group={{
            name: activeL2.name,
            avatar_url: activeL2.image_url,
            member_count: activeL2.member_count,
            men_count: activeL2.men_count,
            women_count: activeL2.women_count,
            gold_key: activeL2.gold_key,
            silver_key: activeL2.silver_key,
            join_url: activeL2.join_url,
          }}
          onClose={() => setActiveL2(null)}
        />
      ) : null}
    </div>
  );
}

/** Ô thống kê nhỏ trong card nhóm — icon + số đếm nổi bật, nhãn mờ bên dưới. */
function GroupStatCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 ${tone}`}>
      <span aria-hidden="true" className="opacity-80">
        {icon}
      </span>
      <span className="text-[15px] font-extrabold leading-none tabular-nums">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</span>
    </div>
  );
}

/** Popup cấp 4 — chi tiết 1 nhóm (avatar, số liệu, nút Tham gia). */
const POPUP4_Z = POPUP3_Z + 10;

type GroupDetailData = Pick<
  ZaloAreaGroup,
  | "name"
  | "avatar_url"
  | "member_count"
  | "men_count"
  | "women_count"
  | "gold_key"
  | "silver_key"
  | "join_url"
>;

function GroupDetailModal({
  group,
  onClose,
}: {
  group: GroupDetailData;
  onClose: () => void;
}) {
  const [vipPopupOpen, setVipPopupOpen] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <Portal>
    <ModalFrame onClose={onClose} zIndex={POPUP4_Z} fitContent>
      <div className="flex flex-col items-center gap-3 px-5 pb-5 pt-9 text-center">
        <span className="zg-avatar-ring relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full p-[2px]">
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white ring-2 ring-card">
            {group.avatar_url ? (
              <img src={group.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Zalo3DIcon className="h-14 w-14 block" />
            )}
          </span>
        </span>
        <strong className="max-w-full text-[17px] font-extrabold leading-tight tracking-tight text-foreground">
          {group.name}
        </strong>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1 text-[12px] font-bold text-violet-600 dark:text-violet-300">
          <Users size={13} strokeWidth={2.5} aria-hidden="true" />
          <span className="tabular-nums">{group.member_count} thành viên</span>
        </span>
        <div className="mt-1 grid w-full grid-cols-4 gap-1.5">
          <GroupStatCell
            icon={<Mars size={14} strokeWidth={2.5} />}
            label="Nam"
            value={group.men_count}
            tone="bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300"
          />
          <GroupStatCell
            icon={<Venus size={14} strokeWidth={2.5} />}
            label="Nữ"
            value={group.women_count}
            tone="bg-pink-500/10 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300"
          />
          <GroupStatCell
            icon={<Crown size={14} strokeWidth={2.5} />}
            label="Key vàng"
            value={group.gold_key}
            tone="bg-amber-400/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
          />
          <GroupStatCell
            icon={<KeyRound size={14} strokeWidth={2.5} />}
            label="Key bạc"
            value={group.silver_key}
            tone="bg-slate-400/15 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300"
          />
        </div>
        <button
          type="button"
          onClick={() => setVipPopupOpen(true)}
          className="mt-2 inline-grid h-12 w-full place-items-center rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-[14.5px] font-extrabold uppercase tracking-wide text-white shadow-lg shadow-violet-500/30 transition-transform duration-150 active:scale-95"
        >
          THAM GIA NGAY
        </button>
      </div>
      <CommonLockedPopup open={vipPopupOpen} onClose={() => setVipPopupOpen(false)} variant="zalo" />
    </ModalFrame>
    </Portal>
  );
}

type ListedGroup = {
  group: ZaloAreaGroup;
  context: string;
};

/** Danh sách CARD NHÓM ngay sau khi user chọn một CARD MỤC tại Việt Nam. */
function ItemGroupsModal({
  countryId,
  item,
  userId,
  userProvince,
  onClose,
}: {
  countryId: CountryFlagId;
  item: ZaloSubItemL1;
  userId?: string | null;
  userProvince?: string | null;
  onClose: () => void;
}) {
  const [activeGroup, setActiveGroup] = useState<ZaloAreaGroup | null>(null);
  const isLocationItem = hasLocationToken(item.name);
  const title = resolveLocationName(item.name, userProvince);
  const province = resolveProvince(String(userProvince ?? "")) || String(userProvince ?? "");

  const areasQuery = useZaloUserAreas({
    userId: isLocationItem ? userId : null,
    itemId: isLocationItem ? item.id : null,
    location: isLocationItem ? userProvince : null,
    areaLimit: item.area_limit ?? 0,
  });
  const subItemsQuery = useQuery({
    queryKey: ["zalo-sub-items-l2", item.id],
    queryFn: () => listZaloSubItemsL2(item.id, { onlyEnabled: true }),
    enabled: !isLocationItem,
    staleTime: 60 * 1000,
  });

  const subItems = subItemsQuery.data ?? [];
  const contexts = isLocationItem
    ? (areasQuery.data ?? []).map((area) => ({ id: area, label: area }))
    : subItems.map((sub) => ({ id: sub.id, label: sub.subtitle || sub.name }));
  const contextsReady = isLocationItem ? !areasQuery.isLoading : !subItemsQuery.isLoading;
  const groupsQuery = useQuery({
    queryKey: [
      "zalo-item-groups",
      countryId,
      item.id,
      isLocationItem ? province : "",
      contexts.map((entry) => entry.id),
    ],
    queryFn: async (): Promise<ListedGroup[]> => {
      const lists = await Promise.all(
        contexts.map(async (entry) => ({
          context: entry.label,
          groups: await listZaloAreaGroups(
            {
              platform: "zalo",
              country_id: countryId,
              item_id: item.id,
              province: isLocationItem ? province : "",
              area_id: entry.id,
            },
            { onlyEnabled: true },
          ),
        })),
      );
      return lists.flatMap(({ context, groups }, index) => {
        if (groups.length > 0 || isLocationItem) {
          return groups.map((group) => ({ group, context }));
        }

        // Dữ liệu cũ lưu chính card nhóm ở zalo_sub_items_l2. Giữ nguyên row
        // và map nó sang cùng kiểu hiển thị khi chưa có group con tương ứng.
        const sub = subItems[index];
        if (!sub) return [];
        return [{
          context: sub.subtitle,
          group: {
            id: sub.id,
            platform: "zalo",
            country_id: countryId,
            item_id: item.id,
            province: "",
            area_id: sub.id,
            name: sub.name,
            avatar_url: sub.image_url,
            member_count: sub.member_count,
            men_count: sub.men_count,
            women_count: sub.women_count,
            gold_key: sub.gold_key,
            silver_key: sub.silver_key,
            join_url: sub.join_url,
            enabled: sub.enabled,
            sort_order: sub.sort_order,
          },
        }];
      });
    },
    enabled: contextsReady && contexts.length > 0,
    staleTime: 60 * 1000,
  });
  const groups = groupsQuery.data ?? [];
  const loading = !contextsReady || groupsQuery.isLoading;

  return (
    <Portal>
      <ModalFrame
        title={title}
        subtitle={loading ? "Đang tải nhóm…" : `${groups.length} nhóm khả dụng`}
        onClose={onClose}
        zIndex={POPUP3_Z}
      >
      <div
        data-zalo-modal-scroll
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:px-5"
      >
        {loading ? (
          [0, 1, 2].map((index) => (
            <div key={index} className="zg-card flex animate-pulse items-center gap-3 rounded-[22px] px-3.5 py-4">
              <span className="h-[58px] w-[58px] shrink-0 rounded-full bg-violet-500/10" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="h-3.5 w-2/3 rounded-full bg-violet-500/10" />
                <span className="h-3 w-1/3 rounded-full bg-violet-500/10" />
              </span>
            </div>
          ))
        ) : groups.length > 0 ? (
          groups.map(({ group }) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroup(group)}
              className="zg-vip-card group flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-transform duration-150 active:scale-[0.99]"
            >
              <span className="zg-vip-avatar-ring relative grid h-[48px] w-[48px] shrink-0 place-items-center overflow-hidden rounded-full p-[2px]">
                <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white ring-2 ring-card">
                  {group.avatar_url ? (
                    <img src={group.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Zalo3DIcon className="h-9 w-9 block" />
                  )}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                {/* Hàng 1: Badge NHÓM (nhỏ gọn) + Tên nhóm (đậm, ellipsis) */}
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="zg-vip-badge inline-flex shrink-0 rounded-md px-1.5 py-px text-[8.5px] font-extrabold uppercase leading-none">
                    Nhóm
                  </span>
                  <strong className="block min-w-0 truncate text-[14.5px] font-extrabold leading-tight tracking-tight text-foreground">
                    {group.name}
                  </strong>
                </span>

                {/* Link che mờ — nằm BÊN DƯỚI tên nhóm, không hiện link thật */}
                <span className="zg-vip-link mt-1" aria-hidden="true">
                  <span className="zg-vip-link-text">
                    {group.join_url || "zalo.com/g/••••••••••••••••••"}
                  </span>
                  <span className="zg-vip-link-veil">
                    <span className="zg-vip-link-lock">
                      <Lock size={9} aria-hidden="true" />
                    </span>
                  </span>
                </span>

                {/* Thông tin nhóm: chỉ thành viên + key vàng */}
                <span className="mt-1 flex min-w-0 items-center gap-2.5 text-[11px] font-semibold text-muted-foreground">
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <Users size={11} strokeWidth={2.5} aria-hidden="true" />
                    <span className="tabular-nums">{group.member_count} thành viên</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-300">
                    <Crown size={11} strokeWidth={2.5} aria-hidden="true" />
                    <span className="tabular-nums">{group.gold_key}</span>
                  </span>
                </span>
              </span>

              <span className="zg-vip-cta inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold">
                Vào <ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </button>
          ))
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-violet-500/10 text-violet-500 dark:text-violet-300" aria-hidden="true">
              <Users size={22} />
            </span>
            <p className="text-[13px] font-semibold text-muted-foreground">
              {isLocationItem && !province
                ? "Tài khoản của bạn chưa có tỉnh/thành."
                : "Mục này chưa có nhóm nào."}
            </p>
          </div>
        )}
      </div>
        {activeGroup ? (
          <GroupDetailModal group={activeGroup} onClose={() => setActiveGroup(null)} />
        ) : null}
      </ModalFrame>
    </Portal>
  );
}

/** Popup cấp 3 — danh sách nhóm của ĐÚNG một khu vực (chỉ nhóm enabled). */
export function AreaGroupsModal({
  countryId,
  itemId,
  province,
  area,
  headerTitle,
  cardMode = false,
  onClose,
}: {
  countryId: CountryFlagId;
  itemId: string;
  province: string;
  area: string;
  /** Tiêu đề hiển thị (mặc định = area); dùng cho mục lớp 2 vì area là id. */
  headerTitle?: string;
  /** true (mục lớp 2): mỗi nhóm là 1 card bấm được → mở popup chi tiết. */
  cardMode?: boolean;
  onClose: () => void;
}) {
  const [activeGroup, setActiveGroup] = useState<ZaloAreaGroup | null>(null);
  const groupsQuery = useQuery({
    queryKey: ["zalo-area-groups", countryId, itemId, province, area],
    queryFn: () =>
      listZaloAreaGroups(
        { platform: "zalo", country_id: countryId, item_id: itemId, province, area_id: area },
        { onlyEnabled: true },
      ),
    staleTime: 60 * 1000,
  });
  const groups = groupsQuery.data ?? [];

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <ModalFrame
      title={headerTitle ?? area}
      subtitle={
        groupsQuery.isLoading
          ? "Chọn nhóm để tham gia"
          : groups.length > 0
            ? `${groups.length} nhóm khả dụng`
            : "Chọn nhóm để tham gia"
      }
      onClose={onClose}
      zIndex={POPUP3_Z}
      fitContent
    >
      <div
        data-zalo-modal-scroll
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:px-5"
      >
        {groupsQuery.isLoading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className="zg-card flex w-full animate-pulse items-center gap-3 rounded-[22px] px-3.5 py-4"
              >
                <span className="h-[52px] w-[52px] shrink-0 rounded-full bg-violet-500/10" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="h-3.5 w-2/3 rounded-full bg-violet-500/10" />
                  <span className="h-3 w-1/3 rounded-full bg-violet-500/10" />
                </span>
              </div>
            ))}
          </>
        ) : groups.length > 0 ? (
          cardMode ? (
            groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroup(g)}
                className="zg-card grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] px-3.5 py-3 text-left transition-transform duration-150 active:scale-[0.99]"
              >
                <span className="zg-avatar-ring relative grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full p-[2px]">
                  <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white ring-2 ring-card">
                    {g.avatar_url ? (
                      <img src={g.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Zalo3DIcon className="h-10 w-10 block" />
                    )}
                  </span>
                </span>
                <span className="min-w-0">
                  <strong className="block min-w-0 truncate text-[15px] font-extrabold leading-tight tracking-tight text-foreground">
                    {g.name}
                  </strong>
                  <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-300">
                    <Users size={11} strokeWidth={2.5} aria-hidden="true" />
                    <span className="truncate tabular-nums">{g.member_count} thành viên</span>
                  </span>
                </span>
                <span
                  className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-violet-500 dark:text-violet-300"
                  aria-hidden="true"
                >
                  <ArrowRight size={17} strokeWidth={2.5} />
                </span>
              </button>
            ))
          ) : (
          groups.map((g) => (
            <article key={g.id} className="zg-card w-full rounded-[22px] text-left">
              {/* Hàng đầu: avatar + tên + nút Vào */}
              <div className="flex items-center gap-3 px-3.5 pt-3.5">
                <span className="zg-avatar-ring relative grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full p-[2px]">
                  <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white ring-2 ring-card">
                    {g.avatar_url ? (
                      <img src={g.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Zalo3DIcon className="h-10 w-10 block" />
                    )}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block min-w-0 truncate text-[15px] font-extrabold leading-tight tracking-tight text-foreground">
                    {g.name}
                  </strong>
                  <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-300">
                    <Users size={11} strokeWidth={2.5} aria-hidden="true" />
                    <span className="truncate tabular-nums">{g.member_count} thành viên</span>
                  </span>
                </span>
                <a
                  href={g.join_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-grid h-11 min-w-[72px] shrink-0 place-items-center rounded-full bg-gradient-to-r from-violet-600 to-pink-500 px-5 text-[13.5px] font-extrabold text-white shadow-lg shadow-violet-500/30 transition-transform duration-150 active:scale-95"
                >
                  Vào
                </a>
              </div>
              {/* Hàng thống kê: nam / nữ / key vàng / key bạc */}
              <div className="mt-3 grid grid-cols-4 gap-1.5 px-3.5 pb-3.5">
                <GroupStatCell
                  icon={<Mars size={14} strokeWidth={2.5} />}
                  label="Nam"
                  value={g.men_count}
                  tone="bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300"
                />
                <GroupStatCell
                  icon={<Venus size={14} strokeWidth={2.5} />}
                  label="Nữ"
                  value={g.women_count}
                  tone="bg-pink-500/10 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300"
                />
                <GroupStatCell
                  icon={<Crown size={14} strokeWidth={2.5} />}
                  label="Vàng"
                  value={g.gold_key}
                  tone="bg-amber-400/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                />
                <GroupStatCell
                  icon={<KeyRound size={14} strokeWidth={2.5} />}
                  label="Bạc"
                  value={g.silver_key}
                  tone="bg-slate-400/15 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300"
                />
              </div>
            </article>
          ))
          )
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span
              className="grid h-12 w-12 place-items-center rounded-full bg-violet-500/10 text-violet-500 dark:text-violet-300"
              aria-hidden="true"
            >
              <Users size={22} />
            </span>
            <p className="text-[13px] font-semibold text-muted-foreground">
              Khu vực này chưa có nhóm nào.
            </p>
          </div>
        )}
      </div>
      {activeGroup ? (
        <GroupDetailModal group={activeGroup} onClose={() => setActiveGroup(null)} />
      ) : null}
    </ModalFrame>
  );
}

/** Popup cấp 2 — danh sách mục lớp 1 của một quốc gia. */
function CountryItemsModal({
  countryId,
  title,
  onClose,
}: {
  countryId: CountryFlagId;
  title: string;
  onClose: () => void;
}) {
  const { me } = useAuth();
  const userProvince = me?.province ?? null;
  const [activeItem, setActiveItem] = useState<ZaloSubItemL1 | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["zalo-sub-items", countryId],
    queryFn: () => listZaloSubItems(countryId),
    staleTime: 60 * 1000,
  });
  const items = (itemsQuery.data ?? []).filter((it) => it.enabled);

  // Escape: chỉ đóng popup cấp 2.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <ModalFrame title={title} subtitle="Chọn mục bạn muốn tham gia" onClose={onClose} zIndex={POPUP2_Z}>
      <div
        data-zalo-modal-scroll
        className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:px-6"
      >
        {itemsQuery.isLoading ? (
          <p className="py-8 text-center text-[13px] font-semibold text-muted-foreground">Đang tải…</p>
        ) : items.length > 0 ? (
          items.map((item) =>
            countryId === "vn" ? (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveItem(item)}
                className="zg-card group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] px-3 py-3 text-left"
              >
                <span className="zg-avatar-ring relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full p-[2px]">
                  <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-white ring-2 ring-card">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Zalo3DIcon className="h-9 w-9 block" />
                    )}
                  </span>
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-[14.5px] font-extrabold leading-tight text-foreground">
                    {resolveLocationName(item.name, userProvince)}
                  </strong>
                  {item.subtitle ? (
                    <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-muted-foreground">
                      {item.subtitle}
                    </span>
                  ) : null}
                </span>
                <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-violet-500 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-violet-300" aria-hidden="true">
                  <ArrowRight size={18} strokeWidth={2.5} />
                </span>
              </button>
            ) : (
              <SubItemRow
                key={item.id}
                item={item}
                countryId={countryId}
                userId={me?.id ?? null}
                userProvince={userProvince}
              />
            ),
          )
        ) : (
          <p className="py-8 text-center text-[13px] font-semibold text-muted-foreground">
            Chưa có mục nào.
          </p>
        )}
      </div>
      {activeItem ? (
        <ItemGroupsModal
          countryId={countryId}
          item={activeItem}
          userId={me?.id ?? null}
          userProvince={userProvince}
          onClose={() => setActiveItem(null)}
        />
      ) : null}
    </ModalFrame>
  );
}

export function ZaloGroupsPrototype({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeCountry, setActiveCountry] = useState<CountryFlagId | null>(null);
  // Subtitle + trạng thái Bật/Tắt của 3 card quốc gia — đọc từ Supabase (Admin quản lý).
  const { cards, ready } = useZaloCountryCards();
  const { settings: zaloIcon } = useZaloFloatIcon();
  const visibleCountries = ready ? cards.filter((c) => c.enabled) : [];

  // Escape: đóng popup.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Khoá scroll trang nền, chỉ chạy đúng 1 lần theo `open`.
  useLayoutEffect(() => {
    if (!open) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousScrollLocked = body.getAttribute("data-scroll-locked");
    const scrollbarGap = Math.max(0, window.innerWidth - root.clientWidth);

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;
    body.setAttribute("data-scroll-locked", "true");

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      if (previousScrollLocked === null) body.removeAttribute("data-scroll-locked");
      else body.setAttribute("data-scroll-locked", previousScrollLocked);
      window.scrollTo(scrollX, scrollY);
    };
  }, [open]);

  if (!open) return null;

  const activeCard = activeCountry ? cards.find((c) => c.id === activeCountry) : null;

  return (
    <Portal>
      {/* Popup cấp 1 — menu quốc gia */}
      <ModalFrame
        title="VIP Zalo"
        subtitle="Chọn quốc gia của bạn"
        onClose={onClose}
        zIndex={POPUP1_Z}
        fitContent
        vipCountryMenu
        headerIcon={zaloIcon.image_url ? (
          <img src={zaloIcon.image_url} alt="" className="block h-full w-full object-contain" draggable={false} />
        ) : undefined}
      >
        <div
          data-zalo-modal-scroll
          className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:px-5 sm:py-5"
        >
          {visibleCountries.map((country) => (
            <button
              key={country.id}
              type="button"
              onClick={() => setActiveCountry(country.id)}
              className="zg-vip-country-card group grid h-auto w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 px-3.5 py-3.5 text-left"
            >
              <span className="zg-vip-country-flag" aria-hidden="true">
                <CountryFlag id={country.id} />
              </span>
              <span className="min-w-0">
                <strong className="block min-w-0 truncate text-[15px] font-extrabold leading-tight text-foreground">
                  {country.title}
                </strong>
                <span className="mt-1 block min-w-0 truncate text-[11.5px] font-medium text-muted-foreground">
                  {country.subtitle}
                </span>
              </span>
              <span
                className="zg-vip-country-arrow inline-grid h-8 w-8 shrink-0 place-items-center transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <ArrowRight size={17} strokeWidth={1.8} />
              </span>
            </button>
          ))}
        </div>
      </ModalFrame>
      {/* Popup cấp 2 — mục lớp 1 của quốc gia đang chọn */}
      {activeCard ? (
        <CountryItemsModal
          countryId={activeCard.id}
          title={activeCard.title}
          onClose={() => setActiveCountry(null)}
        />
      ) : null}
    </Portal>
  );
}
