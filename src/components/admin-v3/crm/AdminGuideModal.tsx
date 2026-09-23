// Popup "Hướng dẫn Admin" — nội dung lưu vĩnh viễn trong Supabase (text + ảnh).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, X, MapPin, Pencil, Save, RotateCcw, Plus, Trash2, ImagePlus, Loader2,
  GripVertical, ChevronUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { applyRegion, type GuideSection } from "@/lib/crm-guide-content";
import {
  cachedGuideSections,
  fetchGuideSections,
  persistGuideSections,
  restoreDefaultGuideSections,
  uploadGuideImage,
} from "@/lib/crm-guide-store";
import {
  GLOBAL_SCOPE,
  GLOBAL_SECTION_IDS,
  REGION_GUIDE_ITEMS,
  cachedRegionGuides,
  fetchRegionGuides,
  persistRegionGuide,
  regionGuideText,
  toProvince,
  type RegionGuideMap,
} from "@/lib/crm-guide-regions";
import {
  applyLocationName,
  cachedCommunityVipConfigs,
  cachedCommunityVipSets,
  communityVipConfigFor,
  communityVipSetToText,
  DEFAULT_COMMUNITY_VIP_INTRO,
  emptyCommunityVipConfig,
  ensureCommunityVipSet,
  fetchCommunityVipConfigs,
  fetchCommunityVipSets,
  persistCommunityVipConfig,
  type CommunityVipConfig,
  type CommunityVipConfigMap,
  type CommunityVipMap,
  type CommunityVipSet,
} from "@/lib/crm-community-vip";
import {
  cachedMemberBenefits,
  fetchMemberBenefits,
  memberBenefitsFor,
  persistMemberBenefits,
  type MemberBenefit,
  type MemberBenefitMap,
} from "@/lib/crm-member-benefits";
import {
  cachedCommunityRules,
  communityRulesFor,
  fetchCommunityRules,
  persistCommunityRules,
  type CommunityRule,
  type CommunityRuleMap,
} from "@/lib/crm-community-rules";
import {
  cachedFeeConfig,
  fetchFeeConfig,
  persistFeeConfig,
  type FeeConfig,
  type FeeNote,
} from "@/lib/crm-fee-config";
import { circledNumber } from "@/lib/vip-communities";
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { SearchableSelect } from "./SearchableSelect";
import "@/styles/admin-crm-v2.css";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Đã sao chép.");
  } catch {
    toast.error("Trình duyệt chặn sao chép.");
  }
}

const clone = (s: GuideSection) => JSON.parse(JSON.stringify(s)) as GuideSection;

/** 3 mục dùng làm TIN NHẮN SOẠN SẴN cho menu FROM (mồi phí / phí không cao / mồi thành công). */
const PRESET_SECTION_IDS = new Set(["rg-moi-phi", "rg-phi-khong-cao", "rg-feedback"]);


export function AdminGuideModal({
  region,
  onClose,
}: {
  region?: string | null;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<GuideSection[]>(() => cachedGuideSections() ?? []);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("");
  // Khu vực LUÔN quy về cấp Tỉnh/Thành phố (bỏ Quận/Huyện).
  const [reg, setReg] = useState(() => toProvince(region));
  const [regionMap, setRegionMap] = useState<RegionGuideMap>(() => cachedRegionGuides());
  const [regionDraft, setRegionDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GuideSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAt, setUploadingAt] = useState<number | null>(null);
  // Community VIP: sinh 1 lần / tỉnh rồi lưu vĩnh viễn (không random lại khi F5).
  const [vipMap, setVipMap] = useState<CommunityVipMap>(() => cachedCommunityVipSets());
  const [vip, setVip] = useState<CommunityVipSet | null>(null);
  const [vipLoading, setVipLoading] = useState(false);
  // Cấu hình Community VIP theo tỉnh/thành: nội dung ở trên + các mục Lưu ý.
  const [vipCfgMap, setVipCfgMap] = useState<CommunityVipConfigMap>(() => cachedCommunityVipConfigs());
  const [vipCfg, setVipCfg] = useState<CommunityVipConfig>(() => emptyCommunityVipConfig());
  const [savingVipCfg, setSavingVipCfg] = useState(false);
  // Quyền lợi thành viên theo tỉnh/thành (lưu vĩnh viễn, mỗi tỉnh riêng biệt).
  const [benMap, setBenMap] = useState<MemberBenefitMap>(() => cachedMemberBenefits());
  const [benList, setBenList] = useState<MemberBenefit[]>([]);
  const [benForm, setBenForm] = useState<MemberBenefit | null>(null);
  const [savingBen, setSavingBen] = useState(false);
  const [draggedBenefitId, setDraggedBenefitId] = useState<string | null>(null);
  // Nội Quy theo tỉnh/thành: cùng mô hình danh sách của Quyền lợi.
  const [ruleMap, setRuleMap] = useState<CommunityRuleMap>(() => cachedCommunityRules());
  const [ruleList, setRuleList] = useState<CommunityRule[]>([]);
  const [ruleForm, setRuleForm] = useState<CommunityRule | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [draggedRuleId, setDraggedRuleId] = useState<string | null>(null);
  // Phí CR dùng chung: 2 mức phí + danh sách lưu ý.
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(() => cachedFeeConfig());
  const [feeDraft, setFeeDraft] = useState<{ key: "eight_months" | "lifetime"; value: string } | null>(null);
  const [feeNoteForm, setFeeNoteForm] = useState<FeeNote | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [draggedFeeNoteId, setDraggedFeeNoteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fileTarget = useRef<number>(0);

  /**
   * 6 mục DÙNG CHUNG (Quyền lợi, Nội Quy, Mồi phí, Phí không cao, Mồi thành công, Phí CR)
   * → không hỏi khu vực, không phụ thuộc Tỉnh/Thành phố. Community VIP giữ nguyên theo tỉnh.
   */
  const isGlobalSection = GLOBAL_SECTION_IDS.has(active);
  /** Phạm vi lưu/đọc nội dung của mục đang mở. */
  const scope = isGlobalSection ? GLOBAL_SCOPE : reg;
  const scopeLabel = isGlobalSection ? "Dùng chung (toàn bộ khách hàng)" : reg;


  // Tải quyền lợi của tỉnh đang chọn (đổi tỉnh → không lẫn dữ liệu).
  // Quyền lợi thành viên = mục DÙNG CHUNG → luôn đọc/ghi ở phạm vi chung.
  useEffect(() => {
    let alive = true;
    setBenForm(null);
    setBenList(memberBenefitsFor(benMap, GLOBAL_SCOPE));
    void (async () => {
      try {
        const map = await fetchMemberBenefits();
        if (!alive) return;
        setBenMap(map);
        setBenList(memberBenefitsFor(map, GLOBAL_SCOPE));
      } catch {
        /* giữ cache */
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phí CR: đọc cấu hình mới; nếu chưa có thì đưa nội dung ô cũ vào Phí 8 tháng.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const guideMap = await fetchRegionGuides();
        const legacyText = regionGuideText(guideMap, GLOBAL_SCOPE, "rg-so-tien");
        const config = await fetchFeeConfig(legacyText);
        if (alive) setFeeConfig(config);
      } catch { /* giữ cache */ }
    })();
    return () => { alive = false; };
  }, []);

  // Nội Quy CR = mục DÙNG CHUNG → luôn đọc/ghi ở phạm vi chung.
  useEffect(() => {
    let alive = true;
    setRuleForm(null);
    setRuleList(communityRulesFor(ruleMap, GLOBAL_SCOPE));
    void (async () => {
      try {
        const map = await fetchCommunityRules();
        if (!alive) return;
        setRuleMap(map);
        setRuleList(communityRulesFor(map, GLOBAL_SCOPE));
      } catch { /* giữ cache */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lưu danh sách quyền lợi (mọi thao tác thêm/sửa/xóa/bật-tắt đều lưu ngay). */
  const commitBenefits = async (list: MemberBenefit[], msg: string): Promise<boolean> => {
    setSavingBen(true);
    try {
      const next = await persistMemberBenefits(benMap, GLOBAL_SCOPE, list);
      setBenMap(next);
      setBenList(memberBenefitsFor(next, GLOBAL_SCOPE));
      toast.success(msg);
      return true;
    } catch (e) {
      toast.error(`Lưu thất bại: ${(e as Error).message}`);
      return false;
    } finally {
      setSavingBen(false);
    }
  };

  const openBenForm = (item?: MemberBenefit) =>
    setBenForm(
      item ?? {
        id: `benefit-${Date.now().toString(36)}`,
        title: "",
        content: "",
        order: benList.length + 1,
        enabled: true,
      },
    );

  const saveBenForm = async () => {
    if (!benForm) return;
    if (!benForm.title.trim() && !benForm.content.trim()) {
      toast.error("Nhập tiêu đề hoặc nội dung quyền lợi.");
      return;
    }
    const exists = benList.some((b) => b.id === benForm.id);
    const next = exists
      ? benList.map((b) => (b.id === benForm.id ? benForm : b))
      : [...benList, { ...benForm, order: benList.length + 1 }];
    const saved = await commitBenefits(next, exists ? "Đã cập nhật quyền lợi." : "Đã thêm quyền lợi.");
    if (saved) setBenForm(null);
  };

  const removeBenefit = (id: string) => {
    if (!window.confirm("Xóa quyền lợi này?")) return;
    const next = benList
      .filter((b) => b.id !== id)
      .map((b, i) => ({ ...b, order: i + 1 }));
    void commitBenefits(next, "Đã xóa quyền lợi.");
  };

  const toggleBenefit = (id: string, enabled: boolean) =>
    void commitBenefits(
      benList.map((b) => (b.id === id ? { ...b, enabled } : b)),
      enabled ? "Đã bật quyền lợi." : "Đã tắt quyền lợi.",
    );

  const moveBenefit = (id: string, dir: -1 | 1) => {
    const i = benList.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= benList.length) return;
    const arr = [...benList];
    const current = arr[i];
    const target = arr[j];
    if (!current || !target) return;
    arr[i] = target;
    arr[j] = current;
    void commitBenefits(arr.map((b, k) => ({ ...b, order: k + 1 })), "Đã sắp xếp lại.");
  };

  const dropBenefit = (targetId: string) => {
    if (!draggedBenefitId || draggedBenefitId === targetId || savingBen) return;
    const from = benList.findIndex((b) => b.id === draggedBenefitId);
    const to = benList.findIndex((b) => b.id === targetId);
    setDraggedBenefitId(null);
    if (from < 0 || to < 0) return;
    const next = [...benList];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    void commitBenefits(next.map((b, i) => ({ ...b, order: i + 1 })), "Đã lưu thứ tự mới.");
  };

  const commitRules = async (list: CommunityRule[], message: string): Promise<boolean> => {
    setSavingRule(true);
    try {
      const next = await persistCommunityRules(ruleMap, GLOBAL_SCOPE, list);
      setRuleMap(next);
      setRuleList(communityRulesFor(next, GLOBAL_SCOPE));
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(`Lưu thất bại: ${(error as Error).message}`);
      return false;
    } finally { setSavingRule(false); }
  };

  const openRuleForm = (item?: CommunityRule) => setRuleForm(item ?? {
    id: `rule-${Date.now().toString(36)}`, title: "", content: "", order: ruleList.length + 1, enabled: true,
  });

  const saveRuleForm = async () => {
    if (!ruleForm) return;
    if (!ruleForm.title.trim() && !ruleForm.content.trim()) { toast.error("Nhập tiêu đề hoặc nội dung Nội Quy."); return; }
    const exists = ruleList.some((item) => item.id === ruleForm.id);
    const next = exists
      ? ruleList.map((item) => item.id === ruleForm.id ? ruleForm : item)
      : [...ruleList, { ...ruleForm, order: ruleList.length + 1 }];
    if (await commitRules(next, exists ? "Đã cập nhật Nội Quy." : "Đã thêm Nội Quy.")) setRuleForm(null);
  };

  const removeRule = (id: string) => {
    if (!window.confirm("Xóa mục Nội Quy này?")) return;
    void commitRules(ruleList.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index + 1 })), "Đã xóa Nội Quy.");
  };

  const toggleRule = (id: string, enabled: boolean) => void commitRules(
    ruleList.map((item) => item.id === id ? { ...item, enabled } : item),
    enabled ? "Đã bật Nội Quy." : "Đã tắt Nội Quy.",
  );

  const moveRule = (id: string, direction: -1 | 1) => {
    const from = ruleList.findIndex((item) => item.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ruleList.length) return;
    const next = [...ruleList];
    const current = next[from];
    const target = next[to];
    if (!current || !target) return;
    next[from] = target;
    next[to] = current;
    void commitRules(next.map((item, index) => ({ ...item, order: index + 1 })), "Đã sắp xếp lại Nội Quy.");
  };

  const dropRule = (targetId: string) => {
    if (!draggedRuleId || draggedRuleId === targetId || savingRule) return;
    const from = ruleList.findIndex((item) => item.id === draggedRuleId);
    const to = ruleList.findIndex((item) => item.id === targetId);
    setDraggedRuleId(null);
    if (from < 0 || to < 0) return;
    const next = [...ruleList];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    void commitRules(next.map((item, index) => ({ ...item, order: index + 1 })), "Đã lưu thứ tự Nội Quy.");
  };

  const commitFee = async (next: FeeConfig, message: string): Promise<boolean> => {
    setSavingFee(true);
    try {
      const saved = await persistFeeConfig(next);
      setFeeConfig(saved);
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(`Lưu thất bại: ${(error as Error).message}`);
      return false;
    } finally { setSavingFee(false); }
  };

  const saveFeeDraft = async () => {
    if (!feeDraft) return;
    const next = { ...feeConfig, [feeDraft.key]: feeDraft.value };
    if (await commitFee(next, feeDraft.key === "eight_months" ? "Đã lưu Phí 8 tháng." : "Đã lưu Phí vĩnh viễn.")) {
      setFeeDraft(null);
    }
  };

  const openFeeNoteForm = (note?: FeeNote) => setFeeNoteForm(note ?? {
    id: `fee-note-${Date.now().toString(36)}`, content: "", order: feeConfig.notes.length + 1, enabled: true,
  });

  const saveFeeNoteForm = async () => {
    if (!feeNoteForm?.content.trim()) { toast.error("Nhập nội dung lưu ý."); return; }
    const exists = feeConfig.notes.some((note) => note.id === feeNoteForm.id);
    const notes = exists
      ? feeConfig.notes.map((note) => note.id === feeNoteForm.id ? feeNoteForm : note)
      : [...feeConfig.notes, { ...feeNoteForm, order: feeConfig.notes.length + 1 }];
    if (await commitFee({ ...feeConfig, notes }, exists ? "Đã cập nhật lưu ý." : "Đã thêm lưu ý.")) setFeeNoteForm(null);
  };

  const removeFeeNote = (id: string) => {
    if (!window.confirm("Xóa lưu ý này?")) return;
    const notes = feeConfig.notes.filter((note) => note.id !== id).map((note, index) => ({ ...note, order: index + 1 }));
    void commitFee({ ...feeConfig, notes }, "Đã xóa lưu ý.");
  };

  const toggleFeeNote = (id: string, enabled: boolean) => void commitFee({
    ...feeConfig,
    notes: feeConfig.notes.map((note) => note.id === id ? { ...note, enabled } : note),
  }, enabled ? "Đã bật lưu ý." : "Đã tắt lưu ý.");

  const moveFeeNote = (id: string, direction: -1 | 1) => {
    const from = feeConfig.notes.findIndex((note) => note.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= feeConfig.notes.length) return;
    const notes = [...feeConfig.notes];
    const current = notes[from];
    const target = notes[to];
    if (!current || !target) return;
    notes[from] = target;
    notes[to] = current;
    void commitFee({ ...feeConfig, notes: notes.map((note, index) => ({ ...note, order: index + 1 })) }, "Đã sắp xếp lại lưu ý.");
  };

  const dropFeeNote = (targetId: string) => {
    if (!draggedFeeNoteId || draggedFeeNoteId === targetId || savingFee) return;
    const from = feeConfig.notes.findIndex((note) => note.id === draggedFeeNoteId);
    const to = feeConfig.notes.findIndex((note) => note.id === targetId);
    setDraggedFeeNoteId(null);
    if (from < 0 || to < 0) return;
    const notes = [...feeConfig.notes];
    const [moved] = notes.splice(from, 1);
    if (!moved) return;
    notes.splice(to, 0, moved);
    void commitFee({ ...feeConfig, notes: notes.map((note, index) => ({ ...note, order: index + 1 })) }, "Đã lưu thứ tự lưu ý.");
  };

  // Tải nội dung thật từ Supabase (nguồn duy nhất).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await fetchGuideSections();
        if (!alive) return;
        setSections(data);
        setActive((a) => a || data[0]?.id || "");
      } catch {
        toast.error("Không tải được nội dung hướng dẫn từ Cloud.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Cấu hình Community VIP theo tỉnh/thành (nội dung ở trên + Lưu ý).
  useEffect(() => {
    let alive = true;
    if (!reg) { setVipCfg(emptyCommunityVipConfig()); return; }
    setVipCfg(communityVipConfigFor(vipCfgMap, reg));
    void (async () => {
      try {
        const map = await fetchCommunityVipConfigs();
        if (!alive) return;
        setVipCfgMap(map);
        setVipCfg(communityVipConfigFor(map, reg));
      } catch {
        /* giữ cache */
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg]);

  const addVipNote = () =>
    setVipCfg((c) => ({
      ...c,
      notes: [
        ...c.notes,
        {
          id: `note-${Date.now()}`,
          content: "",
          order: c.notes.length + 1,
          enabled: true,
        },
      ],
    }));

  const patchVipNote = (id: string, patch: Partial<CommunityVipConfig["notes"][number]>) =>
    setVipCfg((c) => ({
      ...c,
      notes: c.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));

  const removeVipNote = (id: string) =>
    setVipCfg((c) => ({ ...c, notes: c.notes.filter((n) => n.id !== id) }));

  const saveVipConfig = async () => {
    if (!reg) { toast.error("Vui lòng chọn khu vực (Tỉnh/Thành phố)."); return; }
    setSavingVipCfg(true);
    try {
      const next = await persistCommunityVipConfig(vipCfgMap, reg, vipCfg);
      setVipCfgMap(next);
      setVipCfg(communityVipConfigFor(next, reg));
      toast.success(`Đã lưu cấu hình Community VIP cho ${toProvince(reg) || reg}.`);
    } catch (e) {
      toast.error(`Lưu thất bại: ${(e as Error).message}`);
    } finally {
      setSavingVipCfg(false);
    }
  };


  // Community VIP: tải bộ đã lưu; chưa có thì sinh đúng 1 lần rồi lưu.
  useEffect(() => {
    let alive = true;
    if (!reg) { setVip(null); return; }
    setVipLoading(true);
    void (async () => {
      try {
        const stored = await fetchCommunityVipSets();
        const { map, set } = await ensureCommunityVipSet(stored, reg);
        if (!alive) return;
        setVipMap(map);
        setVip(set);
      } catch {
        if (alive) {
          const cached = vipMap[toProvince(reg) || reg] ?? null;
          setVip(cached);
        }
      } finally {
        if (alive) setVipLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg]);

  // Khách hàng nào được bấm "Kịch bản CSKH" → dropdown khu vực tự đổi theo khách đó
  // (chỉ lấy Tỉnh/Thành phố, bỏ Quận/Huyện).
  useEffect(() => { const p = toProvince(region); if (p) setReg(p); }, [region]);

  // Nội dung 8 mục theo khu vực.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const map = await fetchRegionGuides();
        if (alive) setRegionMap(map);
      } catch {
        /* giữ cache */
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mục "theo khu vực" đang mở (nếu có).
  const regionItem = useMemo(
    () => REGION_GUIDE_ITEMS.find((i) => i.id === active) ?? null,
    [active],
  );

  /** Hiển thị danh sách Community VIP (mục Community VIP theo khu vực). */
  const showCommunityVip = active === "rg-community-vip" || active === "community";
  const showMemberBenefits = active === "rg-quyen-loi";
  const showCommunityRules = active === "rg-noi-quy";
  const showFeeConfig = active === "rg-so-tien";

  const section = useMemo(
    () => (regionItem ? undefined : sections.find((s) => s.id === active) ?? sections[0]),
    [sections, active, regionItem],
  );

  const regionText = regionItem ? regionGuideText(regionMap, scope, regionItem.id) : "";

  const select = (id: string) => {
    setActive(id);
    setEditing(false);
    setDraft(null);
    setRegionDraft(null);
    setFeeDraft(null);
    setFeeNoteForm(null);
  };

  // Đổi khu vực → thoát chế độ sửa để không lẫn nội dung giữa các khu vực.
  useEffect(() => { setRegionDraft(null); }, [reg]);

  const saveRegionDraft = async () => {
    if (!regionItem || regionDraft === null) return;
    if (!scope) { toast.error("Vui lòng chọn khu vực (Tỉnh/Thành phố) trước khi lưu."); return; }
    setSaving(true);
    try {
      const next = await persistRegionGuide(regionMap, scope, regionItem.id, regionDraft);
      setRegionMap(next);
      setRegionDraft(null);
      toast.success(`Đã lưu nội dung "${regionItem.label}"${isGlobalSection ? " (dùng chung)" : ` cho ${toProvince(reg)}`}.`);
    } catch (e) {
      toast.error(`Lưu thất bại: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (!section) return;
    setDraft(clone(section));
    setEditing(true);
  };

  const commit = async (next: GuideSection[], msg: string) => {
    setSaving(true);
    try {
      await persistGuideSections(next);
      setSections(next);
      setEditing(false);
      setDraft(null);
      toast.success(msg);
    } catch (e) {
      toast.error(`Lưu thất bại: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    void commit(
      sections.map((s) => (s.id === draft.id ? draft : s)),
      "Đã lưu vĩnh viễn vào Cloud.",
    );
  };

  const doReset = async () => {
    if (!window.confirm("Khôi phục toàn bộ nội dung về mặc định? Nội dung đang có sẽ bị ghi đè.")) return;
    setSaving(true);
    try {
      const next = await restoreDefaultGuideSections();
      setSections(next);
      setActive(next[0]?.id || "");
      setEditing(false);
      setDraft(null);
      toast.success("Đã khôi phục nội dung mặc định.");
    } catch (e) {
      toast.error(`Không khôi phục được: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const addScriptSection = () => {
    const id = `script-${Date.now().toString(36)}`;
    const item: GuideSection = {
      id,
      icon: "💬",
      label: "Kịch bản mới",
      group: "script",
      blocks: [{ title: "Tiêu đề", text: "Nội dung tin nhắn…" }],
    };
    void commit([...sections, item], "Đã thêm mục kịch bản.");
    setActive(id);
  };

  const deleteSection = (id: string) => {
    if (!window.confirm("Xóa mục này? Không thể hoàn tác.")) return;
    const next = sections.filter((s) => s.id !== id);
    setActive(next[0]?.id || "");
    void commit(next, "Đã xóa mục.");
  };

  const patchBlock = (i: number, patch: Partial<{ title: string; text: string; image: string }>) =>
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const pickImage = (i: number) => { fileTarget.current = i; fileRef.current?.click(); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const i = fileTarget.current;
    setUploadingAt(i);
    try {
      const url = await uploadGuideImage(file);
      patchBlock(i, { image: url });
      toast.success("Đã tải ảnh lên. Nhấn Lưu để lưu vĩnh viễn.");
    } catch (e) {
      toast.error(`Tải ảnh thất bại: ${(e as Error).message}`);
    } finally {
      setUploadingAt(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const topLevel = sections.filter((s) => s.group !== "script");
  const scriptItems = sections.filter((s) => s.group === "script");

  return (
    <div className="crm2-overlay" onClick={onClose}>
      <div className="crm2-guide" onClick={(e) => e.stopPropagation()}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        <div className="crm2-guide-head">
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="crm2-guide-title">👁 Hướng dẫn Admin tư vấn &amp; chốt khách</div>
            <div className="crm2-guide-region">
              {isGlobalSection
                ? "NỘI DUNG DÙNG CHUNG — ÁP DỤNG CHO MỌI KHÁCH HÀNG"
                : reg
                  ? `CỘNG ĐỒNG VIP ZALO ${reg.toUpperCase()}`
                  : "— Chọn khu vực —"}
            </div>
          </div>
          <div className="crm2-guide-head-actions">
            {/* 6 mục dùng chung → KHÔNG hiện dropdown Tỉnh/Thành phố. */}
            {!isGlobalSection && (
              <>
                <MapPin size={14} style={{ opacity: 0.6 }} />
                <SearchableSelect
                  className="crm2-ss-compact"
                  value={reg}
                  options={VN_PROVINCES}
                  placeholder="— Chọn khu vực —"
                  onChange={setReg}
                />
              </>
            )}
            <button className="crm2-btn ghost sm" onClick={onClose} aria-label="Đóng">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="crm2-guide-body">
          <div className="crm2-guide-side">
            {topLevel.map((s) => (
              <div key={s.id}>
                <button
                  className={`crm2-guide-nav ${s.id === active ? "active" : ""}`}
                  onClick={() => select(s.id)}
                >
                  <span>{s.icon}</span> {s.label}
                </button>

                {s.id === "script" && (
                  <div className="crm2-guide-sub">
                    {scriptItems.map((c) => (
                      <button
                        key={c.id}
                        className={`crm2-guide-nav sub ${c.id === active ? "active" : ""}`}
                        onClick={() => select(c.id)}
                      >
                        <span>{c.icon}</span> {c.label}
                      </button>
                    ))}
                    <button className="crm2-guide-nav sub add" onClick={addScriptSection} disabled={saving}>
                      <Plus size={13} /> Thêm kịch bản
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div className="crm2-guide-sub" style={{ marginTop: 6 }}>
              {REGION_GUIDE_ITEMS.map((i) => {
                const preset = PRESET_SECTION_IDS.has(i.id);
                const global = GLOBAL_SECTION_IDS.has(i.id);
                return (
                  <button
                    key={i.id}
                    className={`crm2-guide-nav sub ${i.id === active ? "active" : ""}`}
                    onClick={() => select(i.id)}
                    title={
                      global
                        ? "Nội dung dùng chung cho toàn bộ khách hàng (không theo khu vực)"
                        : preset
                        ? `Tin nhắn soạn sẵn cho FROM${reg ? ` — ${reg}` : ""}`
                        : `Nội dung riêng theo khu vực${reg ? ` — ${reg}` : ""}`
                    }
                  >
                    <span>{i.icon}</span> {i.label}
                    {preset ? <span style={{ opacity: 0.6, fontSize: 11 }}> · tin nhắn</span> : null}
                  </button>
                );
              })}
            </div>


            <button className="crm2-guide-nav" onClick={() => void doReset()} title="Khôi phục nội dung gốc" disabled={saving}>
              <RotateCcw size={14} /> Khôi phục mặc định
            </button>
          </div>

          <div className="crm2-guide-content">
            <div className="crm2-guide-bar">
              <div className="crm2-guide-bar-title">
                {regionItem ? `${regionItem.icon} ${regionItem.label}` : `${section?.icon ?? ""} ${section?.label ?? ""}`}
                {regionItem && (
                  <span style={{ opacity: 0.65, fontWeight: 400 }}>
                    {" "}· {scopeLabel || "— Chọn khu vực —"}
                  </span>
                )}
              </div>
              {regionItem && !showMemberBenefits && !showCommunityRules && !showFeeConfig ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {regionDraft === null ? (
                    <>
                      <button
                        className="crm2-btn sm"
                        onClick={() => setRegionDraft(regionText)}
                        disabled={!scope}
                        title={scope ? "" : "Chọn khu vực trước"}
                      >
                        <Pencil size={12} /> Chỉnh sửa
                      </button>
                      <button
                        className="crm2-btn sm"
                        onClick={() => void copyText(applyRegion(regionText, isGlobalSection ? "" : reg))}
                        disabled={!regionText}
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="crm2-btn sm primary" onClick={() => void saveRegionDraft()} disabled={saving}>
                        {saving ? <Loader2 size={12} className="crm2-spin" /> : <Save size={12} />} Lưu
                      </button>
                      <button className="crm2-btn sm" onClick={() => setRegionDraft(null)}>Hủy</button>
                    </>
                  )}
                </div>
              ) : showMemberBenefits || showCommunityRules || showFeeConfig ? null : !editing ? (

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm2-btn sm" onClick={startEdit}><Pencil size={12} /> Chỉnh sửa</button>
                  {section?.group === "script" && (
                    <button className="crm2-btn sm danger" onClick={() => deleteSection(section.id)} disabled={saving}>
                      <Trash2 size={12} /> Xóa mục
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm2-btn sm primary" onClick={saveDraft} disabled={saving}>
                    {saving ? <Loader2 size={12} className="crm2-spin" /> : <Save size={12} />} Lưu
                  </button>
                  <button className="crm2-btn sm" onClick={() => { setEditing(false); setDraft(null); }}>Hủy</button>
                </div>
              )}
            </div>

            {loading && sections.length === 0 && !regionItem && (
              <div className="crm2-block"><div className="crm2-block-text">Đang tải nội dung từ Cloud…</div></div>
            )}

            {regionItem && !showMemberBenefits && !showCommunityRules && !showFeeConfig && (
              <div className="crm2-block">
                <div className="crm2-block-head">
                    <div className="crm2-block-title">
                      {regionItem.label} — {scopeLabel || "chưa chọn khu vực"}
                    </div>
                </div>

                {!scope ? (
                  <div className="crm2-block-text">
                    Vui lòng chọn khu vực (Tỉnh/Thành phố) ở phía trên để xem và nhập nội dung.
                  </div>
                ) : regionDraft === null ? (
                  <div className="crm2-block-text" style={{ whiteSpace: "pre-wrap" }}>
                    {regionText
                      ? applyRegion(regionText, isGlobalSection ? "" : reg)
                      : isGlobalSection
                        ? "Chưa có nội dung. Bấm “Chỉnh sửa” để nhập nội dung dùng chung."
                        : "Chưa có nội dung cho khu vực này. Bấm “Chỉnh sửa” để nhập."}
                  </div>
                ) : (
                  <>
                    <textarea
                      className="crm2-textarea"
                      rows={Math.max(8, regionDraft.split("\n").length + 1)}
                      value={regionDraft}
                      placeholder={
                        isGlobalSection
                          ? `Nhập nội dung "${regionItem.label}" dùng chung cho mọi khách hàng…`
                          : `Nhập nội dung "${regionItem.label}" cho khu vực ${reg}…`
                      }
                      onChange={(e) => setRegionDraft(e.target.value)}
                    />
                    <div className="crm2-edit-hint">
                      {isGlobalSection ? (
                        <>Nội dung này <b>dùng chung</b> cho toàn bộ khách hàng, không phụ thuộc Tỉnh/Thành phố.</>
                      ) : (
                        <>
                          Nội dung này chỉ áp dụng cho khu vực <b>{reg}</b>. Có thể dùng{" "}
                          <code>{"{location}"}</code>, <code>{"{REGION}"}</code> hoặc <code>{"{REGION_UPPER}"}</code>.
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {showMemberBenefits && !editing && (
              <section className="crm2-benefits" aria-label="Quyền lợi thành viên">
                <div className="crm2-benefits-head">
                  <div>
                    <div className="crm2-benefits-title">Quyền lợi thành viên</div>
                    <div className="crm2-benefits-sub">
                      Cấu hình dùng chung cho toàn bộ khách hàng
                    </div>
                  </div>
                  <button
                    className="crm2-btn primary crm2-benefits-add"
                    onClick={() => openBenForm()}
                    disabled={savingBen}
                  >
                    <Plus size={15} /> THÊM MỤC
                  </button>
                </div>

                {benList.length === 0 ? (
                  <div className="crm2-benefits-empty">Chưa có quyền lợi nào. Bấm “THÊM MỤC” để tạo.</div>
                ) : (
                  <div className="crm2-benefits-list">
                    {benList.map((benefit, index) => (
                      <article
                        key={benefit.id}
                        className={`crm2-benefit-card ${benefit.enabled ? "" : "is-disabled"} ${draggedBenefitId === benefit.id ? "is-dragging" : ""}`}
                        draggable={!savingBen}
                        onDragStart={(event) => {
                          setDraggedBenefitId(benefit.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggedBenefitId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          dropBenefit(benefit.id);
                        }}
                      >
                        <div className="crm2-benefit-number">{String(index + 1).padStart(2, "0")}</div>
                        <div className="crm2-benefit-copy">
                          <div className="crm2-benefit-name">{benefit.title || "Không có tiêu đề"}</div>
                          <div className="crm2-benefit-content">{benefit.content || "—"}</div>
                        </div>
                        <div className="crm2-benefit-actions">
                          <button className="crm2-benefit-action" onClick={() => openBenForm(benefit)} disabled={savingBen}>
                            <Pencil size={14} /> Sửa
                          </button>
                          <button className="crm2-benefit-action danger" onClick={() => removeBenefit(benefit.id)} disabled={savingBen}>
                            <Trash2 size={14} /> Xóa
                          </button>
                          <label className="crm2-benefit-switch">
                            <input
                              type="checkbox"
                              checked={benefit.enabled}
                              disabled={savingBen}
                              onChange={(event) => toggleBenefit(benefit.id, event.target.checked)}
                            />
                            <span aria-hidden="true" />
                            <b>{benefit.enabled ? "Bật" : "Tắt"}</b>
                          </label>
                          <div className="crm2-benefit-order">
                            <button aria-label="Đưa lên" onClick={() => moveBenefit(benefit.id, -1)} disabled={savingBen || index === 0}>
                              <ChevronUp size={14} />
                            </button>
                            <button aria-label="Đưa xuống" onClick={() => moveBenefit(benefit.id, 1)} disabled={savingBen || index === benList.length - 1}>
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <div className="crm2-benefit-drag" title="Kéo để sắp xếp" aria-label="Kéo để sắp xếp">
                            <GripVertical size={18} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {showCommunityRules && !editing && (
              <section className="crm2-benefits" aria-label="Nội Quy">
                <div className="crm2-benefits-head">
                  <div>
                    <div className="crm2-benefits-title">Nội Quy</div>
                    <div className="crm2-benefits-sub">Cấu hình dùng chung cho toàn bộ khách hàng</div>
                  </div>
                  <button className="crm2-btn primary crm2-benefits-add" onClick={() => openRuleForm()} disabled={savingRule}>
                    <Plus size={15} /> THÊM MỤC
                  </button>
                </div>
                {ruleList.length === 0 ? (
                  <div className="crm2-benefits-empty">Chưa có Nội Quy nào. Bấm “THÊM MỤC” để tạo.</div>
                ) : (
                  <div className="crm2-benefits-list">
                    {ruleList.map((rule, index) => (
                      <article
                        key={rule.id}
                        className={`crm2-benefit-card ${rule.enabled ? "" : "is-disabled"} ${draggedRuleId === rule.id ? "is-dragging" : ""}`}
                        draggable={!savingRule}
                        onDragStart={(event) => { setDraggedRuleId(rule.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setDraggedRuleId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.preventDefault(); dropRule(rule.id); }}
                      >
                        <div className="crm2-benefit-number">{String(index + 1).padStart(2, "0")}</div>
                        <div className="crm2-benefit-copy">
                          <div className="crm2-benefit-name">{rule.title || "Không có tiêu đề"}</div>
                          <div className="crm2-benefit-content">{rule.content || "—"}</div>
                        </div>
                        <div className="crm2-benefit-actions">
                          <button className="crm2-benefit-action" onClick={() => openRuleForm(rule)} disabled={savingRule}><Pencil size={14} /> Sửa</button>
                          <button className="crm2-benefit-action danger" onClick={() => removeRule(rule.id)} disabled={savingRule}><Trash2 size={14} /> Xóa</button>
                          <label className="crm2-benefit-switch">
                            <input type="checkbox" checked={rule.enabled} disabled={savingRule} onChange={(event) => toggleRule(rule.id, event.target.checked)} />
                            <span aria-hidden="true" /><b>{rule.enabled ? "Bật" : "Tắt"}</b>
                          </label>
                          <div className="crm2-benefit-order">
                            <button aria-label="Đưa lên" onClick={() => moveRule(rule.id, -1)} disabled={savingRule || index === 0}><ChevronUp size={14} /></button>
                            <button aria-label="Đưa xuống" onClick={() => moveRule(rule.id, 1)} disabled={savingRule || index === ruleList.length - 1}><ChevronDown size={14} /></button>
                          </div>
                          <div className="crm2-benefit-drag" title="Kéo để sắp xếp" aria-label="Kéo để sắp xếp"><GripVertical size={18} /></div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {showFeeConfig && !editing && (
              <section className="crm2-fee" aria-label="Cấu hình Phí CR">
                <div className="crm2-benefits-head">
                  <div>
                    <div className="crm2-benefits-title">Phí CR</div>
                    <div className="crm2-benefits-sub">Nội dung dùng chung cho toàn bộ khách hàng</div>
                  </div>
                </div>

                {([
                  ["eight_months", "PHÍ 8 THÁNG"],
                  ["lifetime", "PHÍ VĨNH VIỄN"],
                ] as const).map(([key, label]) => {
                  const isEditingFee = feeDraft?.key === key;
                  return (
                    <article className={`crm2-fee-tier crm2-fee-tier--${key}`} key={key}>
                      <div className="crm2-fee-tier-head">
                        <div><span>MỨC PHÍ</span><h3>{label}</h3></div>
                        {isEditingFee ? (
                          <div className="crm2-fee-tier-actions">
                            <button className="crm2-btn sm primary" onClick={() => void saveFeeDraft()} disabled={savingFee}><Save size={12} /> Lưu</button>
                            <button className="crm2-btn sm" onClick={() => setFeeDraft(null)} disabled={savingFee}>Hủy</button>
                          </div>
                        ) : (
                          <button className="crm2-btn sm" onClick={() => setFeeDraft({ key, value: feeConfig[key] })} disabled={savingFee}><Pencil size={12} /> Sửa</button>
                        )}
                      </div>
                      {isEditingFee ? (
                        <textarea className="crm2-textarea" rows={6} value={feeDraft.value} placeholder={`Nhập nội dung ${label.toLowerCase()}…`} onChange={(event) => setFeeDraft({ key, value: event.target.value })} />
                      ) : (
                        <div className="crm2-fee-tier-content">{feeConfig[key] || "Chưa có nội dung. Bấm “Sửa” để nhập."}</div>
                      )}
                    </article>
                  );
                })}

                <div className="crm2-fee-notes-head">
                  <div><h3>LƯU Ý CHO THÀNH VIÊN</h3><p>Chỉ các mục đang bật mới xuất hiện trong card gửi khách.</p></div>
                  <button className="crm2-btn primary" onClick={() => openFeeNoteForm()} disabled={savingFee}><Plus size={14} /> THÊM LƯU Ý</button>
                </div>
                {feeConfig.notes.length === 0 ? (
                  <div className="crm2-benefits-empty">Chưa có lưu ý nào. Bấm “THÊM LƯU Ý” để tạo.</div>
                ) : (
                  <div className="crm2-benefits-list">
                    {feeConfig.notes.map((note, index) => (
                      <article
                        key={note.id}
                        className={`crm2-benefit-card ${note.enabled ? "" : "is-disabled"} ${draggedFeeNoteId === note.id ? "is-dragging" : ""}`}
                        draggable={!savingFee}
                        onDragStart={(event) => { setDraggedFeeNoteId(note.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setDraggedFeeNoteId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.preventDefault(); dropFeeNote(note.id); }}
                      >
                        <div className="crm2-benefit-number">{String(index + 1).padStart(2, "0")}</div>
                        <div className="crm2-benefit-copy"><div className="crm2-benefit-name">Lưu ý {index + 1}</div><div className="crm2-benefit-content">{note.content}</div></div>
                        <div className="crm2-benefit-actions">
                          <button className="crm2-benefit-action" onClick={() => openFeeNoteForm(note)} disabled={savingFee}><Pencil size={14} /> Sửa</button>
                          <button className="crm2-benefit-action danger" onClick={() => removeFeeNote(note.id)} disabled={savingFee}><Trash2 size={14} /> Xóa</button>
                          <label className="crm2-benefit-switch"><input type="checkbox" checked={note.enabled} disabled={savingFee} onChange={(event) => toggleFeeNote(note.id, event.target.checked)} /><span aria-hidden="true" /><b>{note.enabled ? "Bật" : "Tắt"}</b></label>
                          <div className="crm2-benefit-order"><button aria-label="Đưa lên" onClick={() => moveFeeNote(note.id, -1)} disabled={savingFee || index === 0}><ChevronUp size={14} /></button><button aria-label="Đưa xuống" onClick={() => moveFeeNote(note.id, 1)} disabled={savingFee || index === feeConfig.notes.length - 1}><ChevronDown size={14} /></button></div>
                          <div className="crm2-benefit-drag" title="Kéo để sắp xếp" aria-label="Kéo để sắp xếp"><GripVertical size={18} /></div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}


            {showCommunityVip && !editing && (
              <div className="crm2-block">
                <div className="crm2-block-head">
                  <div className="crm2-block-title">
                    Cấu hình Community VIP — {reg || "— chưa chọn —"}
                  </div>
                  {reg && (
                    <button
                      className="crm2-btn sm"
                      disabled={savingVipCfg}
                      onClick={() => void saveVipConfig()}
                    >
                      <Save size={12} /> {savingVipCfg ? "Đang lưu…" : "Lưu cấu hình"}
                    </button>
                  )}
                </div>

                {!reg ? (
                  <div className="crm2-block-text">
                    Chọn khu vực (Tỉnh/Thành phố) ở phía trên để cấu hình.
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0 4px" }}>
                      Nội dung ở trên (hiện phía trên danh sách nhóm)
                    </div>
                    <textarea
                      className="crm2-textarea"
                      rows={3}
                      value={vipCfg.intro}
                      placeholder={DEFAULT_COMMUNITY_VIP_INTRO}
                      onChange={(e) => setVipCfg({ ...vipCfg, intro: e.target.value })}
                    />
                    <div className="crm2-edit-hint">
                      Dùng <code>{"{location}"}</code> để tự thay bằng tỉnh/thành của khách.
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        margin: "14px 0 6px",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Các mục Lưu ý</div>
                      <button className="crm2-btn sm" onClick={addVipNote}>
                        <Plus size={12} /> Thêm lưu ý
                      </button>
                    </div>

                    {vipCfg.notes.length === 0 ? (
                      <div className="crm2-block-text">
                        Chưa có mục Lưu ý nào cho {reg}. Bấm “Thêm lưu ý”.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {vipCfg.notes.map((n, i) => (
                          <div
                            key={n.id}
                            style={{
                              border: "1px solid rgba(120,120,140,0.28)",
                              borderRadius: 12,
                              padding: 10,
                              opacity: n.enabled ? 1 : 0.6,
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <strong style={{ fontSize: 12.5 }}>Lưu ý {i + 1}</strong>
                              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                                Thứ tự
                                <input
                                  type="number"
                                  min={1}
                                  value={n.order}
                                  onChange={(e) =>
                                    patchVipNote(n.id, { order: Number(e.target.value) || i + 1 })
                                  }
                                  style={{
                                    width: 58,
                                    padding: "4px 6px",
                                    borderRadius: 8,
                                    border: "1px solid rgba(120,120,140,0.3)",
                                    background: "transparent",
                                    color: "inherit",
                                  }}
                                />
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={n.enabled}
                                  onChange={(e) => patchVipNote(n.id, { enabled: e.target.checked })}
                                />
                                Bật
                              </label>
                              <button
                                className="crm2-btn sm"
                                style={{ marginLeft: "auto" }}
                                onClick={() => removeVipNote(n.id)}
                              >
                                <Trash2 size={12} /> Xóa
                              </button>
                            </div>
                            <textarea
                              className="crm2-textarea"
                              rows={2}
                              value={n.content}
                              placeholder="Nội dung lưu ý…"
                              onChange={(e) => patchVipNote(n.id, { content: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}


            {showCommunityVip && !editing && (
              <div className="crm2-block">
                <div className="crm2-block-head">
                  <div className="crm2-block-title">
                    Danh sách cộng đồng khu vực {reg || "— chưa chọn —"}
                  </div>
                  {vip && (
                    <button className="crm2-btn sm" onClick={() => void copyText(communityVipSetToText(vip))}>
                      <Copy size={12} /> Copy
                    </button>
                  )}
                </div>

                {!reg ? (
                  <div className="crm2-block-text">
                    Chọn khu vực (Tỉnh/Thành phố) ở phía trên để xem danh sách cộng đồng.
                  </div>
                ) : vipLoading && !vip ? (
                  <div className="crm2-block-text">Đang tải danh sách cộng đồng…</div>
                ) : !vip ? (
                  <div className="crm2-block-text">Chưa có dữ liệu cho khu vực này.</div>
                ) : (
                  <>
                    <div className="crm2-vip-title">🔥 CỘNG ĐỒNG VIP ZALO {vip.province.toUpperCase()}</div>
                    <div className="crm2-vip-grid">
                      {vip.groups.map((g, i) => (
                        <div className="crm2-vip-item" key={`${g.name_template}-${i}`}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {vip.avatar_url && (
                              <img
                                src={vip.avatar_url}
                                alt="Zalo"
                                loading="lazy"
                                decoding="async"
                                style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
                              />
                            )}
                            <div className="crm2-vip-name">
                              {circledNumber(i)} {applyLocationName(g.name_template, vip.province)}
                              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 500 }}>📍 {g.district}</div>
                            </div>
                          </div>
                          <div className="crm2-vip-stats">
                            <span>👥 {g.members} thành viên</span>
                            <span className="m">♂ Nam: {g.men}</span>
                            <span className="f">♀ Nữ: {g.women}</span>
                            <span>👑 Admin: {g.gold_key + g.silver_key}</span>
                            <span>🟡 Key Vàng: {g.gold_key}</span>
                            <span>⚪ Key Bạc: {g.silver_key}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {!editing &&
              section?.blocks.map((b, i) => {
                const text = applyRegion(b.text, reg);
                return (
                  <div className="crm2-block" key={`${section.id}-${i}`}>
                    <div className="crm2-block-head">
                      <div className="crm2-block-title">
                        {b.title ? applyRegion(b.title, reg) : `${section.label} ${i + 1}`}
                      </div>
                      <button className="crm2-btn sm" onClick={() => void copyText(text)}>
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <div className="crm2-block-text">{text}</div>
                    {b.image && (
                      <img decoding="async" className="crm2-block-img" src={b.image} alt={b.title || "Ảnh minh hoạ"} loading="lazy" />
                    )}
                  </div>
                );
              })}

            {editing && draft && (
              <>
                <div className="crm2-block">
                  <div className="crm2-block-head">
                    <div className="crm2-block-title">Tên mục</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="crm2-input"
                      style={{ width: 70, textAlign: "center" }}
                      value={draft.icon}
                      onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                    />
                    <input
                      className="crm2-input"
                      style={{ flex: 1 }}
                      value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    />
                  </div>
                </div>

                {draft.blocks.map((b, i) => (
                  <div className="crm2-block" key={`edit-${i}`}>
                    <div className="crm2-block-head">
                      <input
                        className="crm2-input crm2-edit-title"
                        value={b.title ?? ""}
                        placeholder="Tiêu đề…"
                        onChange={(e) => patchBlock(i, { title: e.target.value })}
                      />
                      <button
                        className="crm2-btn sm danger"
                        onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((_, j) => j !== i) })}
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </div>
                    <textarea
                      className="crm2-textarea"
                      rows={Math.max(4, b.text.split("\n").length + 1)}
                      value={b.text}
                      onChange={(e) => patchBlock(i, { text: e.target.value })}
                    />
                    {b.image && (
                      <img decoding="async" className="crm2-block-img" src={b.image} alt="Ảnh minh hoạ" loading="lazy" />
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="crm2-btn sm" onClick={() => pickImage(i)} disabled={uploadingAt === i}>
                        {uploadingAt === i ? <Loader2 size={12} className="crm2-spin" /> : <ImagePlus size={12} />}
                        {b.image ? " Đổi ảnh" : " Thêm ảnh"}
                      </button>
                      {b.image && (
                        <button className="crm2-btn sm danger" onClick={() => patchBlock(i, { image: "" })}>
                          <Trash2 size={12} /> Xóa ảnh
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  className="crm2-btn"
                  onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { title: "", text: "" }] })}
                >
                  <Plus size={14} /> Thêm dòng
                </button>
                <div className="crm2-edit-hint">
                  Mẹo: dùng <code>{"{REGION}"}</code> và <code>{"{REGION_UPPER}"}</code> để tự động thay theo khu vực.
                  Nội dung &amp; ảnh được lưu vĩnh viễn trong Cloud sau khi bấm Lưu.
                </div>
              </>
            )}
          </div>
        </div>

        {benForm && (
          <div className="crm2-benefit-modal-backdrop" onClick={() => !savingBen && setBenForm(null)}>
            <div className="crm2-benefit-modal" role="dialog" aria-modal="true" aria-labelledby="benefit-dialog-title" onClick={(event) => event.stopPropagation()}>
              <div className="crm2-benefit-modal-head">
                <div>
                  <div className="crm2-benefit-modal-kicker">DÙNG CHUNG</div>
                  <h3 id="benefit-dialog-title">{benList.some((b) => b.id === benForm.id) ? "SỬA QUYỀN LỢI" : "THÊM QUYỀN LỢI"}</h3>
                </div>
                <button className="crm2-btn ghost sm" onClick={() => setBenForm(null)} disabled={savingBen} aria-label="Đóng">
                  <X size={17} />
                </button>
              </div>
              <div className="crm2-benefit-modal-body">
                <label className="crm2-benefit-field">
                  <span>Tiêu đề quyền lợi</span>
                  <input
                    className="crm2-input"
                    value={benForm.title}
                    autoFocus
                    placeholder="Nhập tiêu đề quyền lợi"
                    onChange={(event) => setBenForm({ ...benForm, title: event.target.value })}
                  />
                </label>
                <label className="crm2-benefit-field">
                  <span>Nội dung quyền lợi</span>
                  <textarea
                    className="crm2-textarea"
                    rows={5}
                    value={benForm.content}
                    placeholder="Nhập nội dung quyền lợi"
                    onChange={(event) => setBenForm({ ...benForm, content: event.target.value })}
                  />
                </label>
              </div>
              <div className="crm2-benefit-modal-actions">
                <button className="crm2-btn" onClick={() => setBenForm(null)} disabled={savingBen}>Hủy</button>
                <button className="crm2-btn primary" onClick={() => void saveBenForm()} disabled={savingBen}>
                  {savingBen ? <Loader2 size={14} className="crm2-spin" /> : <Save size={14} />} Lưu
                </button>
              </div>
            </div>
          </div>
        )}
        {ruleForm && (
          <div className="crm2-benefit-modal-backdrop" onClick={() => !savingRule && setRuleForm(null)}>
            <div className="crm2-benefit-modal" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title" onClick={(event) => event.stopPropagation()}>
              <div className="crm2-benefit-modal-head">
                <div><div className="crm2-benefit-modal-kicker">DÙNG CHUNG</div><h3 id="rule-dialog-title">{ruleList.some((item) => item.id === ruleForm.id) ? "SỬA NỘI QUY" : "THÊM NỘI QUY"}</h3></div>
                <button className="crm2-btn ghost sm" onClick={() => setRuleForm(null)} disabled={savingRule} aria-label="Đóng"><X size={17} /></button>
              </div>
              <div className="crm2-benefit-modal-body">
                <label className="crm2-benefit-field"><span>Tiêu đề</span><input className="crm2-input" value={ruleForm.title} autoFocus placeholder="Nhập tiêu đề Nội Quy" onChange={(event) => setRuleForm({ ...ruleForm, title: event.target.value })} /></label>
                <label className="crm2-benefit-field"><span>Nội dung</span><textarea className="crm2-textarea" rows={5} value={ruleForm.content} placeholder="Nhập nội dung Nội Quy" onChange={(event) => setRuleForm({ ...ruleForm, content: event.target.value })} /></label>
              </div>
              <div className="crm2-benefit-modal-actions">
                <button className="crm2-btn" onClick={() => setRuleForm(null)} disabled={savingRule}>Hủy</button>
                <button className="crm2-btn primary" onClick={() => void saveRuleForm()} disabled={savingRule}>{savingRule ? <Loader2 size={14} className="crm2-spin" /> : <Save size={14} />} Lưu</button>
              </div>
            </div>
          </div>
        )}
        {feeNoteForm && (
          <div className="crm2-benefit-modal-backdrop" onClick={() => !savingFee && setFeeNoteForm(null)}>
            <div className="crm2-benefit-modal" role="dialog" aria-modal="true" aria-labelledby="fee-note-dialog-title" onClick={(event) => event.stopPropagation()}>
              <div className="crm2-benefit-modal-head">
                <div><div className="crm2-benefit-modal-kicker">DÙNG CHUNG</div><h3 id="fee-note-dialog-title">{feeConfig.notes.some((note) => note.id === feeNoteForm.id) ? "SỬA LƯU Ý" : "THÊM LƯU Ý"}</h3></div>
                <button className="crm2-btn ghost sm" onClick={() => setFeeNoteForm(null)} disabled={savingFee} aria-label="Đóng"><X size={17} /></button>
              </div>
              <div className="crm2-benefit-modal-body">
                <label className="crm2-benefit-field"><span>Nội dung lưu ý</span><textarea className="crm2-textarea" rows={5} value={feeNoteForm.content} autoFocus placeholder="Nhập nội dung lưu ý" onChange={(event) => setFeeNoteForm({ ...feeNoteForm, content: event.target.value })} /></label>
              </div>
              <div className="crm2-benefit-modal-actions">
                <button className="crm2-btn" onClick={() => setFeeNoteForm(null)} disabled={savingFee}>Hủy</button>
                <button className="crm2-btn primary" onClick={() => void saveFeeNoteForm()} disabled={savingFee}>{savingFee ? <Loader2 size={14} className="crm2-spin" /> : <Save size={14} />} Lưu</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
