/**
 * VipRequiredPopup — TÊN CHUẨN của popup VIP DUY NHẤT toàn website.
 * Chỉ là alias của VipUnlockModal (một component, một cấu hình, một link Admin).
 * KHÔNG tạo popup mới ở bất kỳ nơi nào khác.
 */
export {
  VipUnlockModal as VipRequiredPopup,
  VIP_UNLOCK_BENEFITS,
  type VipUnlockModalProps as VipRequiredPopupProps,
} from "@/components/candy/vip-unlock-modal";

export { VipUnlockModal as default } from "@/components/candy/vip-unlock-modal";
