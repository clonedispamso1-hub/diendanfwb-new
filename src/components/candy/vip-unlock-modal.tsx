/**
 * VipUnlockModal — CẦU NỐI tới popup DUY NHẤT CommonLockedPopup.
 * Không tạo popup riêng ở bất kỳ đâu; mọi call-site cũ vẫn hoạt động.
 */
export {
  CommonLockedPopup as VipUnlockModal,
  CommonLockedPopup,
  VIP_UNLOCK_BENEFITS,
  type CommonLockedPopupProps as VipUnlockModalProps,
} from "@/components/candy/common-locked-popup";

export { CommonLockedPopup as default } from "@/components/candy/common-locked-popup";
