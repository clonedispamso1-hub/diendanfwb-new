import { avatarSrc } from "@/lib/image-cdn";
import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Search, Trash2, Ban, Gift, Users, Dices, X, Flag, Sparkles, Plus, Pencil, Upload, Image as ImageIcon, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth, PROFILE_COLUMNS } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { read3 } from "@/lib/content-db";
import { formatCandy } from "@/lib/format";
import { AdminReportsTab } from "@/components/candy/admin-reports-tab";
import type { Profile } from "@/lib/app-types";
import { buffFakeFollowers, getTotalFollowerCount } from "@/lib/buff-followers";
import { adminListFakeProfiles, adminCreateFakeProfile, adminUpdateFakeProfile, adminDeleteFakeProfile, type FakeProfileRecord } from "@/lib/fake-profiles";
import { generateFakeIdentity, pickFakeAvatar } from "@/lib/fake-identity";
import { listTitleGifs, uploadTitleGif, deleteTitleGif, TITLES_ALLOWED_EXT, type TitleGif } from "@/lib/title-gifs";
import { adminListVirtualThreads, adminReplyVirtual, adminMarkThreadRead, loadVirtualThread } from "@/lib/virtual-profiles";
import { FeedbackManager } from "@/components/candy/admin-modules/feedback-manager";
import { AdminModulesHub } from "@/components/candy/admin-modules/admin-modules-hub";
import { AccountApprovalsTab } from "@/components/candy/admin-modules/account-approvals-tab";
import { LayoutGrid, ShieldCheck, Star, Crown } from "lucide-react";
import { ProfileStickerPicker } from "@/components/candy/profile-sticker-picker";
import { BaoDepTraiHub } from "@/components/candy/admin-modules/bao-dep-trai-hub";
import { MediaItem } from "@/components/admin-v3/MediaItem";
import { chatDb } from "@/lib/chat-db";
import { resolveUserName } from "@/lib/user-name";


const MAX_CANDY = 999_000_000;
const MAX_FOLLOWERS = 999_000;

export function AdminPanel() {
  const { me, isAdmin, refreshMe } = useAuth();
  const [search, setSearch] = useState("");
  const [lockIdInput, setLockIdInput] = useState("");
  const [lockDays, setLockDays] = useState(7);
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [buffCandy, setBuffCandy] = useState("");
  const [buffFollowers, setBuffFollowers] = useState("");
  const [buffing, setBuffing] = useState(false);
  const [buffProgress, setBuffProgress] = useState<{ done: number; total: number } | null>(null);
  const [buffError, setBuffError] = useState<string | null>(null);
  const [vipDiamondPct, setVipDiamondPct] = useState("5");
  const [vipGoldPct, setVipGoldPct] = useState("15");
  const [vipSilverPct, setVipSilverPct] = useState("30");
  const [gameControl, setGameControl] = useState<"tai" | "xiu" | "random">("random");
  const [posts, setPosts] = useState<any[]>([]);
  const [tab, setTab] = useState<"users" | "reports" | "posts" | "game" | "fakes" | "titles" | "vchat" | "vnicks" | "modules" | "approvals" | "feedback" | "baodeptrai">("users");

  // ===== Virtual chat (Admin reply) =====
  const [vThreads, setVThreads] = useState<any[]>([]);
  const [vLoading, setVLoading] = useState(false);
  const [vActive, setVActive] = useState<{ virtual_id: string; customer_id: string; virtual: any; customer: any } | null>(null);
  const [vMessages, setVMessages] = useState<any[]>([]);
  const [vReply, setVReply] = useState("");
  const [vSending, setVSending] = useState(false);

  const loadVChat = useCallback(async () => {
    setVLoading(true);
    try {
      setVThreads(await adminListVirtualThreads());
    } catch (e: any) {
      toast.error("Không tải được tin nhắn ảo: " + (e?.message || e));
    } finally {
      setVLoading(false);
    }
  }, []);

  const openVThread = async (t: any) => {
    setVActive(t);
    try {
      const msgs = await loadVirtualThread(t.virtual_id, t.customer_id);
      setVMessages(msgs);
      await adminMarkThreadRead(t.virtual_id, t.customer_id);
      void loadVChat();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải hội thoại");
    }
  };

  const sendVReply = async () => {
    if (!vActive || !vReply.trim()) return;
    setVSending(true);
    try {
      await adminReplyVirtual(vActive.virtual_id, vActive.customer_id, vReply.trim());
      setVReply("");
      const msgs = await loadVirtualThread(vActive.virtual_id, vActive.customer_id);
      setVMessages(msgs);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi gửi");
    } finally {
      setVSending(false);
    }
  };

  // ===== Tạo nick ảo nhanh (Giai đoạn 2) =====
  const FLIRT_BIOS = [
    "Đang tìm 1 người đủ kiên nhẫn để chiều mình mỗi tối 💕",
    "Hôm nay trời đẹp ghê, thiếu mỗi anh thôi 🌸",
    "Sống hết mình, yêu hết lòng, online hết đêm 🌙",
    "Một ly cafe + một anh đáng yêu = ngày hoàn hảo ☕✨",
    "Thả thính chuyên nghiệp, cắn câu là chuyện của anh 🎣",
    "Crush ai đó mỏi rồi, giờ chờ ai đó crush mình 🍒",
    "Không drama, không toxic, chỉ cần anh chân thành 💖",
    "Hơi nhõng nhẽo xíu nhưng dễ thương lắm nha 🐾",
    "Tìm người cùng xem phim khuya và nhắn tin tới sáng 🎬",
    "Người ta nói duyên là do trời, nên mình thử app này xem sao 💫",
    "Yêu xa được không anh? Em ở rất xa… trái tim anh 💌",
    "Đang FA, cần một anh để khoe với hội bạn 😚",
  ];
  const pickFlirtBio = () => FLIRT_BIOS[Math.floor(Math.random() * FLIRT_BIOS.length)];
  const randomPassword = () =>
    Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 99);

  const [vcName, setVcName] = useState("");
  const [vcUsername, setVcUsername] = useState("");
  const [vcPassword, setVcPassword] = useState("");
  const [vcAvatarUrl, setVcAvatarUrl] = useState("");
  const [vcBio, setVcBio] = useState(() => FLIRT_BIOS[0]);
  const [vcCreating, setVcCreating] = useState(false);

  // ===== Quản lý Nick ảo (tab vnicks): tạo nick ảo trong bảng profiles =====
  const VN_CATEGORIES: Array<{ id: "ons" | "fwb" | "dating"; label: string; intent: string }> = [
    { id: "ons", label: "🔥 ONS", intent: "ons" },
    { id: "fwb", label: "✨ FWB", intent: "fwb" },
    { id: "dating", label: "❤️ Người yêu", intent: "dating" },
  ];
  const [vnList, setVnList] = useState<any[]>([]);
  const [vnLoading, setVnLoading] = useState(false);
  const [vnFilter, setVnFilter] = useState<"all" | "ons" | "fwb" | "dating">("all");
  const [vnName, setVnName] = useState("");
  const [vnGender, setVnGender] = useState<"female" | "male">("female");
  const [vnProvince, setVnProvince] = useState("");
  const [vnAvatar, setVnAvatar] = useState(() => pickFakeAvatar());
  const [vnCategory, setVnCategory] = useState<"ons" | "fwb" | "dating">("ons");
  const [vnCreating, setVnCreating] = useState(false);
  const [vnPosting, setVnPosting] = useState<string | null>(null);

  const SAMPLE_POSTS: Record<"ons" | "fwb" | "dating", string[]> = {
    ons: [
      "Tối nay rảnh, có ai cùng đi cafe rồi tính tiếp không 😏",
      "Đang buồn, cần một người bên cạnh tối nay 🌙",
      "Chán quá, ai rủ mình đi đâu đi 💋",
    ],
    fwb: [
      "Tìm 1 người chill chill cuối tuần đi xem phim, ăn uống ✨",
      "FWB lâu dài, kín đáo, tôn trọng nhau nhé 💕",
      "Mình ở khu vực này, có ai gần không? 🌸",
    ],
    dating: [
      "Tìm một người chân thành, cùng nhau đi đường dài ❤️",
      "Mơ về một mái ấm nhỏ với người mình yêu 🏡",
      "FA quá lâu rồi, mong gặp đúng người 💌",
    ],
  };

  const fillRandomVcIdentity = () => {
    const id = generateFakeIdentity();
    setVcName(id.displayName);
    setVcUsername(id.username);
    setVcPassword(randomPassword());
    setVcAvatarUrl(pickFakeAvatar());
    setVcBio(pickFlirtBio());
  };

  const loadVNicks = useCallback(async () => {
    setVnLoading(true);
    try {
      const sb = supabase as any;
      const { data, error } = await sb.from("profiles")
        .select("id, full_name, username, avatar, province, intent, gender, created_at")
        .eq("is_virtual", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setVnList(data || []);
    } catch (e: any) {
      toast.error("Không tải được danh sách nick ảo: " + (e?.message || e));
    } finally {
      setVnLoading(false);
    }
  }, []);

  const fillRandomVnick = () => {
    const id = generateFakeIdentity();
    setVnName(id.displayName);
    setVnAvatar(pickFakeAvatar());
  };

  const createVNick = async () => {
    const name = vnName.trim();
    if (!name) return toast.error("Cần nhập tên hiển thị");
    setVnCreating(true);
    try {
      const sb = supabase as any;
      const id = generateFakeIdentity();
      const intent = VN_CATEGORIES.find((c) => c.id === vnCategory)!.intent;
      const payload: any = {
        full_name: name,
        username: id.username,
        avatar: vnAvatar || pickFakeAvatar(),
        bio: pickFlirtBio(),
        province: vnProvince.trim() || null,
        location: vnProvince.trim() || null,
        gender: vnGender,
        intent,
        is_virtual: true,
        is_online: true,
        followers_count: 50 + Math.floor(Math.random() * 950),
        vip_level: 0,
        trust_score: 98,
        role: "user",
        is_admin: false,
        is_banned: false,
      };
      const { error } = await sb.from("profiles").insert([payload]);
      if (error) throw error;
      toast.success(`Đã tạo nick ảo "${name}" (category: ${vnCategory})`);
      setVnName("");
      setVnAvatar(pickFakeAvatar());
      // clear suggest cache để Feed ngay lập tức thấy
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("vprof.suggest.v1::")) localStorage.removeItem(k);
        });
      } catch { /* ignore */ }
      void loadVNicks();
    } catch (e: any) {
      toast.error("Lỗi tạo nick ảo: " + (e?.message || e));
    } finally {
      setVnCreating(false);
    }
  };

  const postFakePost = async (vn: any) => {
    setVnPosting(vn.id);
    try {
      const sb = supabase as any;
      const cat: "ons" | "fwb" | "dating" =
        vn.intent === "fwb" ? "fwb" :
        vn.intent === "serious" || vn.intent === "dating" ? "dating" : "ons";
      const samples = SAMPLE_POSTS[cat];
      const content = samples[Math.floor(Math.random() * samples.length)];
      const payload: any = {
        user_id: vn.id,
        content,
        visibility: "home",
        status: "published",
        category: cat,
      };
      let { error } = await sb.from("posts").insert([payload]);
      if (error && /column .*category.* does not exist/i.test(error.message || "")) {
        const { category: _c, ...rest } = payload;
        ({ error } = await sb.from("posts").insert([rest]));
      }
      if (error) throw error;
      toast.success(`Đã đăng bài ảo cho ${vn.full_name || vn.username}`);
    } catch (e: any) {
      toast.error("Lỗi đăng bài ảo: " + (e?.message || e));
    } finally {
      setVnPosting(null);
    }
  };

  const deleteVNick = async (vn: any) => {
    if (!confirm(`Xóa nick ảo "${vn.full_name || vn.username}"?`)) return;
    const sb = supabase as any;
    const { error } = await sb.from("profiles").delete().eq("id", vn.id);
    if (error) return toast.error("Lỗi xóa: " + error.message);
    setVnList((prev) => prev.filter((x) => x.id !== vn.id));
    toast.success("Đã xóa");
  };


  const createVirtualNick = async () => {
    const name = vcName.trim();
    const uname = vcUsername.trim();
    const pwd = vcPassword.trim();
    if (!name || !uname || !pwd) {
      toast.error("Cần tên, tài khoản và mật khẩu");
      return;
    }
    setVcCreating(true);
    try {
      const sb = supabase as any;
      const province = (me as any)?.province || null;
      const payload = {
        full_name: name,
        username: uname,
        password: pwd,
        bio: vcBio,
        avatar: vcAvatarUrl.trim() || pickFakeAvatar(),
        province,
        location: province,
        is_virtual: true,
        is_online: true,
        followers_count: 50 + Math.floor(Math.random() * 950),
        vip_level: 0,
        trust_score: 98,
        role: "user",
        is_admin: false,
        is_banned: false,
      };

      // 1) Ưu tiên gọi RPC (SECURITY DEFINER) để bypass RLS.
      let lastErr: any = null;
      const rpcRes = await sb.rpc("admin_create_virtual_profile", { p_payload: payload });
      if (rpcRes.error) {
        lastErr = rpcRes.error;
        // 2) Fallback: insert trực tiếp (cần RLS policy cho admin).
        const ins = await sb.from("profiles").insert([payload]);
        if (ins.error) {
          // Nếu RPC chưa được tạo trên DB, hướng dẫn rõ ràng.
          const isMissingFn = /function .*admin_create_virtual_profile.* does not exist|Could not find the function/i.test(
            lastErr?.message || "",
          );
          throw new Error(
            (isMissingFn
              ? "Chưa cài RPC. Hãy chạy docs/MIGRATION_RPC_CREATE_VIRTUAL_PROFILE.sql trên Supabase. "
              : "") + (ins.error.message || lastErr?.message || "Unknown"),
          );
        }
      }

      toast.success(`Đã tạo nick ảo "${name}" (${uname})`);
      setVcName(""); setVcUsername(""); setVcPassword(""); setVcAvatarUrl(""); setVcBio(pickFlirtBio());
      // Refresh ngay danh sách hội thoại + nick ảo.
      void loadVChat();
    } catch (e: any) {
      toast.error("Không tạo được: " + (e?.message || e));
    } finally {
      setVcCreating(false);
    }
  };

  // ===== Title GIF state =====
  const [titleGifs, setTitleGifs] = useState<TitleGif[]>([]);
  const [titlesLoading, setTitlesLoading] = useState(false);
  const [uploadingTitle, setUploadingTitle] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const titleFileInputRef = useRef<HTMLInputElement>(null);

  const loadTitleGifs = useCallback(async () => {
    setTitlesLoading(true);
    try {
      setTitleGifs(await listTitleGifs());
    } catch (e: any) {
      toast.error("Không tải được danh sách danh hiệu: " + (e?.message || e));
    } finally {
      setTitlesLoading(false);
    }
  }, []);

  const handleUploadTitleFile = async (file: File) => {
    setUploadingTitle(true);
    try {
      const created = await uploadTitleGif(file);
      setTitleGifs((prev) => [created, ...prev.filter((g) => g.name !== created.name)]);
      toast.success(`Đã tải lên danh hiệu: ${created.label}`);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi upload");
    } finally {
      setUploadingTitle(false);
    }
  };

  const handleUploadTitlesFromInput = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await handleUploadTitleFile(file);
    }
    if (titleFileInputRef.current) titleFileInputRef.current.value = "";
  };

  const handleDeleteTitleGif = async (gif: TitleGif) => {
    if (!confirm("Hành động này sẽ xóa danh hiệu của TOÀN BỘ người dùng đang sử dụng. Bạn có chắc chắn không?")) return;
    try {
      await deleteTitleGif(gif);
      setTitleGifs((prev) => prev.filter((g) => g.name !== gif.name));
      // Đồng bộ UI: bất kỳ user nào đang dùng URL này → reset null
      setUsers((prev) => prev.map((u) => (u.title_gif_url === gif.url ? { ...u, title_gif_url: null } : u)));
      setSelectedUser((prev) => (prev && prev.title_gif_url === gif.url ? { ...prev, title_gif_url: null } : prev));
      toast.success(`Đã xóa vĩnh viễn "${gif.label}"`);
      if (me?.title_gif_url === gif.url) await refreshMe();
    } catch (e: any) {
      toast.error("Lỗi xóa: " + (e?.message || e));
    }
  };

  // ===== Fake profiles state =====
  const [fakeList, setFakeList] = useState<FakeProfileRecord[]>([]);
  const [fakeLoading, setFakeLoading] = useState(false);
  const [fakeEdit, setFakeEdit] = useState<Partial<FakeProfileRecord> | null>(null);
  const [fakeSaving, setFakeSaving] = useState(false);
  const [confirmDeleteAllFakes, setConfirmDeleteAllFakes] = useState(false);
  const [deletingAllFakes, setDeletingAllFakes] = useState(false);

  /**
   * Xoá toàn bộ tài khoản ảo:
   * - Bảng `fake_profiles` (nick FWB ảo / buff follower)
   * - Profiles có cờ `is_virtual = true` (nick ảo trong bảng profiles chính)
   */
  const deleteAllVirtualAccounts = async () => {
    setDeletingAllFakes(true);
    try {
      const sb = supabase as any;
      let removedFakes = 0;
      let removedVirtuals = 0;

      // 1) fake_profiles + fake_follows (cascade qua FK nếu có)
      try {
        const { error, count } = await sb
          .from("fake_profiles")
          .delete({ count: "exact" })
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (!error) removedFakes = count || 0;
      } catch (e) { console.warn("[delete fake_profiles]", e); }

      // 2) profiles có is_virtual = true
      try {
        const { error, count } = await sb
          .from("profiles")
          .delete({ count: "exact" })
          .eq("is_virtual", true);
        if (error) throw error;
        removedVirtuals = count || 0;
      } catch (e: any) {
        toast.error("Lỗi xoá profiles ảo: " + (e?.message || e));
      }

      toast.success(
        `Đã xoá ${removedFakes} nick FWB ảo + ${removedVirtuals} profile ảo.`,
      );
      setFakeList([]);
      void searchUsers();
    } finally {
      setDeletingAllFakes(false);
      setConfirmDeleteAllFakes(false);
    }
  };

  const loadFakes = async () => {
    setFakeLoading(true);
    try {
      setFakeList(await adminListFakeProfiles(200));
    } catch (e: any) {
      alert("Không tải được nick ảo: " + (e?.message || e));
    } finally {
      setFakeLoading(false);
    }
  };

  const newFakeDraft = (): Partial<FakeProfileRecord> => {
    const id = generateFakeIdentity("vi");
    return {
      username: id.username,
      display_name: id.displayName,
      avatar_url: pickFakeAvatar(),
      locale: "vi",
      vip_level: 2,
      province: "",
      bio: "",
    };
  };

  const saveFake = async () => {
    if (!fakeEdit) return;
    if (!fakeEdit.username?.trim() || !fakeEdit.display_name?.trim()) {
      return alert("Username và Tên hiển thị bắt buộc.");
    }
    setFakeSaving(true);
    try {
      if (fakeEdit.id) {
        await adminUpdateFakeProfile(fakeEdit.id, {
          username: fakeEdit.username,
          display_name: fakeEdit.display_name,
          full_name: fakeEdit.display_name,
          avatar_url: fakeEdit.avatar_url,
          avatar: fakeEdit.avatar_url,
          locale: (fakeEdit.locale as any) || "vi",
          vip_level: fakeEdit.vip_level ?? 0,
          province: (fakeEdit.province as any) || null,
          bio: fakeEdit.bio || null,
          gem_balance: typeof fakeEdit.gem_balance === "number" ? fakeEdit.gem_balance : 0,
        });
      } else {
        await adminCreateFakeProfile({
          username: fakeEdit.username!,
          display_name: fakeEdit.display_name!,
          avatar_url: fakeEdit.avatar_url || pickFakeAvatar(),
          locale: (fakeEdit.locale as string) || "vi",
          vip_level: fakeEdit.vip_level ?? 0,
          province: (fakeEdit.province as string) || null,
          bio: fakeEdit.bio as string | undefined,
        });
      }
      setFakeEdit(null);
      await loadFakes();
    } catch (e: any) {
      alert("Lỗi: " + (e?.message || e));
    } finally {
      setFakeSaving(false);
    }
  };

  const removeFake = async (id: string) => {
    if (!confirm("Xóa nick ảo này?")) return;
    try {
      await adminDeleteFakeProfile(id);
      setFakeList((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert("Lỗi: " + (e?.message || e));
    }
  };

  const isCurrentUser = (user: Pick<Profile, "id"> | null | undefined) => user?.id === me?.id;

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    return "Có lỗi xảy ra khi buff follower.";
  };

  const openUserById = async (userId: string) => {
    const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
    if (data) {
      setSelectedUser(data as Profile);
      setTab("users");
    }
  };

  const searchUsers = async () => {
    const q = search.trim().toLowerCase();
    if (!q) {
      const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).order("created_at", { ascending: false }).limit(20);
      setUsers(data || []);
      return;
    }
    // Hỗ trợ tìm theo Mã ID hiển thị (public_id), username hoặc tên
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .or(`public_id.ilike.%${q}%,username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(20);
    setUsers(data || []);
  };

  const handleBanByPublicId = async (publicId: string, days: number) => {
    const code = publicId.trim();
    if (!code) return toast.error("Vui lòng nhập Mã ID");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, username, public_id")
      .eq("public_id", code)
      .maybeSingle();
    if (error || !data) return toast.error(`Không tìm thấy tài khoản với Mã ID: ${code}`);
    await handleBan((data as any).id, days);
    toast.success(`Đã khóa ${days} ngày tài khoản ID ${code} (${(data as any).full_name || (data as any).username || "?"})`);
  };

  const handleUnbanByPublicId = async (publicId: string) => {
    const code = publicId.trim();
    if (!code) return toast.error("Vui lòng nhập Mã ID");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, username, public_id")
      .eq("public_id", code)
      .maybeSingle();
    if (error || !data) return toast.error(`Không tìm thấy tài khoản với Mã ID: ${code}`);
    await handleUnban((data as any).id);
    toast.success(`Đã mở khóa tài khoản ID ${code} (${(data as any).full_name || (data as any).username || "?"})`);
  };

  useEffect(() => {
    if (isAdmin) {
      void searchUsers();
      void loadTitleGifs();
      void loadVChat();
    }
  }, [isAdmin, loadTitleGifs, loadVChat]);

  // ===== Realtime: lắng nghe tin nhắn mới (bảng messages duy nhất) =====
  useEffect(() => {
    if (!isAdmin) return;
    const sb = chatDb();
    const channel = sb
      .channel("admin-vchat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          // Reload list — chỉ cần biết có tin mới liên quan tới nick ảo hay không,
          // adminListVirtualThreads sẽ tự lọc.
          void loadVChat();
          if (tab !== "vchat") {
            toast.message("📩 Có tin nhắn mới (kiểm tra tab Tin nhắn ảo)", {
              description: (row.content || "").slice(0, 80),
            });
          }
        },
      )
      .subscribe();
    return () => { try { sb.removeChannel(channel); } catch { /* */ } };
  }, [isAdmin, tab, loadVChat]);


  if (!isAdmin) return <div className="empty-state">⛔ Bạn không có quyền admin.</div>;

  const handleBuffCandy = async (userId: string) => {
    const amount = parseInt(buffCandy);
    if (isNaN(amount) || amount <= 0) return alert("Nhập số Coin hợp lệ (> 0).");

    // ⚠️ Không UPDATE trực tiếp gem_balance từ client — trigger DB sẽ chặn.
    // Gọi RPC SECURITY DEFINER `admin_adjust_gem_balance` để cộng dồn an toàn.
    const { data, error } = await supabase.rpc("admin_adjust_gem_balance" as any, {
      p_target_user_id: userId,
      p_amount: amount,
      p_reason: "admin_buff_candy",
    });
    if (error) return alert("Lỗi RPC: " + error.message);
    const res = (data || {}) as { ok?: boolean; code?: string; message?: string; new?: number };
    if (!res.ok) {
      return alert(res.message || `Giao dịch thất bại (${res.code || "UNKNOWN"}).`);
    }
    const newTotal = Number(res.new ?? 0);
    if (newTotal > MAX_CANDY) {
      // Chỉ cảnh báo nếu vượt giới hạn UI (RPC vẫn cho phép).
      console.warn("[admin] gem_balance vượt MAX_CANDY UI:", newTotal);
    }
    alert(`✅ Đã cộng ${formatCandy(amount)} Coin (tổng hiện tại: ${formatCandy(newTotal)}).`);
    setBuffCandy("");
    setSelectedUser((prev) => (prev ? { ...prev, gem_balance: newTotal } : prev));
    void searchUsers();

    if (userId === me?.id) {
      await refreshMe();
    }
  };

  const handleBuffFollowers = async (userId: string) => {
    const amount = parseInt(buffFollowers);
    if (isNaN(amount) || amount < 0) return alert("Nhập số followers hợp lệ.");
    if (amount > 1000) return alert("Tối đa 1.000 follower ảo mỗi lần buff.");

    const dPct = Math.max(0, parseFloat(vipDiamondPct) || 0);
    const gPct = Math.max(0, parseFloat(vipGoldPct) || 0);
    const sPct = Math.max(0, parseFloat(vipSilverPct) || 0);
    if (dPct + gPct + sPct > 100) {
      return alert("Tổng % VIP (Kim cương + Vàng + Bạc) không được vượt quá 100%.");
    }

    setBuffing(true);
    setBuffError(null);
    setBuffProgress({ done: 0, total: amount });
    try {
      const created = await buffFakeFollowers(
        userId,
        amount,
        (done, total) => setBuffProgress({ done, total }),
        { diamondPct: dPct, goldPct: gPct, silverPct: sPct },
      );
      const nextFollowerCount = await getTotalFollowerCount(userId);
      alert(`✅ Đã tạo ${created.toLocaleString()} follower ảo cho user này!`);
      setBuffFollowers("");
      setBuffError(null);
      setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, followers_count: nextFollowerCount } : prev));
      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, followers_count: nextFollowerCount } : user)));
      void searchUsers();
      if (userId === me?.id) await refreshMe();
    } catch (err) {
      const msg = getErrorMessage(err);
      setBuffError(msg);
      if (msg.toLowerCase().includes("fake_profiles") || msg.toLowerCase().includes("fake_follows") || msg.toLowerCase().includes("does not exist")) {
        alert("⚠️ Bảng fake_profiles / fake_follows chưa tồn tại. Hãy chạy file SQL migration_fake_followers.sql trong Supabase trước.");
      } else {
        alert("Lỗi: " + msg);
      }
    } finally {
      setBuffing(false);
      setBuffProgress(null);
    }
  };

  const handleBan = async (userId: string, days: number) => {
    const bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("profiles").update({ is_banned: true, banned_until: bannedUntil }).eq("id", userId);
    alert(`Đã cấm ${days} ngày!`);
    void searchUsers();
  };

  const handleUnban = async (userId: string) => {
    await supabase.from("profiles").update({ is_banned: false, banned_until: null }).eq("id", userId);
    alert("Đã gỡ lệnh cấm!");
    void searchUsers();
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Xác nhận XÓA tài khoản này?")) return;
    await supabase.from("profiles").delete().eq("id", userId);
    alert("Đã xóa tài khoản!");
    setSelectedUser(null);
    void searchUsers();
  };

  const handleAssignTitleGif = async (user: Profile, gifUrl: string | null) => {
    const username = user.username || resolveUserName(user as any, "user");
    const { error } = await supabase
      .from("profiles")
      .update({ title_gif_url: gifUrl })
      .eq("id", user.id);
    if (error) {
      toast.error("Lỗi gán danh hiệu: " + error.message);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, title_gif_url: gifUrl } : u)));
    setSelectedUser((prev) => (prev && prev.id === user.id ? { ...prev, title_gif_url: gifUrl } : prev));
    if (gifUrl) {
      toast.success(`Đã gán danh hiệu thành công cho ${username}`);
    } else {
      toast.success(`Đã xóa danh hiệu của ${username}`);
    }
    if (user.id === me?.id) await refreshMe();
  };

  const loadPosts = async () => {
    // ĐỌC bài viết từ Supabase 3; profiles vẫn nằm ở Supabase 1 nên ghép tay.
    const { data } = await read3()
      .from("posts")
      .select("id, user_id, content, image_url, image_urls, likes_count, comments_count, created_at, is_pinned, is_hidden, status, category")
      .order("created_at", { ascending: false })
      .limit(50);
    const list: any[] = data || [];
    const ids = Array.from(new Set(list.map((p) => p.user_id).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await (supabase.from("profiles") as any)
        .select("id, username, full_name")
        .in("id", ids);
      const map = new Map<string, any>((profs || []).map((x: any) => [x.id, x]));
      list.forEach((p) => {
        p.profiles = map.get(p.user_id) ?? null;
      });
    }
    setPosts(list);
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Xóa bài viết này?")) return;
    const target = posts.find((p) => p.id === postId);
    await supabase.from("posts").delete().eq("id", postId);
    alert("Đã xóa!");
    void loadPosts();
  };

  const saveGameControl = () => {
    localStorage.setItem("admin_game_force", gameControl);
    alert(`Đã set kết quả game: ${gameControl === "random" ? "Ngẫu nhiên" : gameControl.toUpperCase()}`);
  };

  return (
    <section className="stack-lg">
      <div className="hero-strip" style={{ background: "linear-gradient(135deg, oklch(0.3 0.15 20), oklch(0.2 0.1 350))", color: "white" }}>
        <div className="stack-xs">
          <p className="eyebrow" style={{ color: "var(--sicbo-gold)" }}>⚙️ Quản trị viên</p>
          <h2 className="section-title" style={{ color: "var(--sicbo-gold)" }}>Admin Panel</h2>
          <p style={{ color: "oklch(0.8 0.04 60)", margin: 0 }}>Xin chào, {me?.full_name || me?.username}</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          { id: "modules" as const, label: "Modules", icon: LayoutGrid },
          { id: "approvals" as const, label: "Duyệt Tài Khoản", icon: ShieldCheck },
          { id: "users" as const, label: "Quản lý User", icon: Users },

          { id: "titles" as const, label: "Quản lý Danh hiệu", icon: ImageIcon },
          { id: "reports" as const, label: "Tố cáo", icon: Flag },
          { id: "posts" as const, label: "Bài viết", icon: Trash2 },
          { id: "vnicks" as const, label: "Quản lý Nick ảo", icon: Sparkles },
          { id: "fakes" as const, label: "Nick ảo (FWB)", icon: Sparkles },
          { id: "vchat" as const, label: "Tin nhắn ảo", icon: MessageCircle },
          { id: "game" as const, label: "Điều khiển Game", icon: Dices },
          { id: "feedback" as const, label: "Quản lý Feedback", icon: Star },
          { id: "baodeptrai" as const, label: "Bảo Đẹp Trai", icon: Crown },
        ]).map((t) => {
          const unreadTotal = t.id === "vchat" ? vThreads.reduce((s, x) => s + (x.unread || 0), 0) : 0;
          return (
            <button
              key={t.id}
              className={`choice-chip ${tab === t.id ? "is-active" : ""}`}
              style={{ position: "relative" }}
              onClick={() => {
                setTab(t.id);
                if (t.id === "posts") void loadPosts();
                if (t.id === "fakes") void loadFakes();
                if (t.id === "titles") void loadTitleGifs();
                if (t.id === "vchat") void loadVChat();
                if (t.id === "vnicks") void loadVNicks();
              }}
            >
              <t.icon size={14} /> {t.label}
              {unreadTotal > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: "var(--destructive, red)",
                    color: "white",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 0 2px white",
                  }}
                >
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              ) : null}
            </button>
          );
        })}

      </div>

      {tab === "modules" && <AdminModulesHub />}

      {tab === "baodeptrai" && <BaoDepTraiHub />}

      {tab === "feedback" && <FeedbackManager />}

      {tab === "approvals" && <AccountApprovalsTab />}


      {tab === "reports" && <AdminReportsTab onSelectUser={(id) => void openUserById(id)} />}

      {tab === "users" && (
        <div className="stack-md">
          {me ? (
            <button className="choice-chip" onClick={() => setSelectedUser(me)}>
              <Shield size={14} /> Mở tài khoản đang đăng nhập của tôi
            </button>
          ) : null}

          <div className="input-with-icon">
            <input
              className="app-input"
              placeholder="Tìm theo Mã ID (vd: 849201), username hoặc tên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchUsers()}
            />
            <button className="input-icon" onClick={() => void searchUsers()}>
              <Search size={18} />
            </button>
          </div>

          {/* Khóa / mở khóa nhanh theo Mã ID hiển thị */}
          <div className="panel" style={{ padding: 14 }}>
            <p className="row-title" style={{ margin: 0, marginBottom: 8 }}>
              🔒 Khóa / Mở khóa theo Mã ID
            </p>
            <p className="row-meta" style={{ marginTop: 0, marginBottom: 10 }}>
              Nhập chính xác Mã ID hiển thị của thành viên (ví dụ: 849201). Hệ thống sẽ tự tìm tài khoản tương ứng và thực thi lệnh.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="app-input"
                placeholder="Mã ID (vd: 849201)"
                value={lockIdInput}
                onChange={(e) => setLockIdInput(e.target.value)}
                style={{ flex: "1 1 160px", minWidth: 140 }}
              />
              <select
                className="app-input"
                value={lockDays}
                onChange={(e) => setLockDays(Number(e.target.value))}
                style={{ width: 120 }}
              >
                <option value={1}>1 ngày</option>
                <option value={3}>3 ngày</option>
                <option value={7}>7 ngày</option>
                <option value={30}>30 ngày</option>
                <option value={365}>1 năm</option>
              </select>
              <button
                className="primary-cta compact"
                style={{ padding: "8px 12px" }}
                onClick={() => void handleBanByPublicId(lockIdInput, lockDays)}
              >
                Khóa
              </button>
              <button
                className="secondary-cta compact"
                style={{ padding: "8px 12px" }}
                onClick={() => void handleUnbanByPublicId(lockIdInput)}
              >
                Mở khóa
              </button>
            </div>
          </div>

          <div className="stack-sm">
            {users.map((u) => (
              <div key={u.id} className="panel" style={{ padding: 14 }}>
                <div className="list-row">
                  <img loading="lazy" decoding="async" className="avatar-sm" src={u.avatar ? avatarSrc(u.avatar, 32) : `https://api.dicebear.com/7.x/thumbs/svg?seed=${u.username}`} alt="" />
                  <div className="grow">
                    <div className="inline-flex items-center gap-2 flex-wrap">
                      <p className="row-title">{resolveUserName(u as any, "Người dùng")}</p>
                      {u.title_gif_url ? (
                        <MediaItem
                          url={u.title_gif_url}
                          alt="Danh hiệu"
                          style={{ height: 22, width: "auto", maxWidth: 80, objectFit: "contain", borderRadius: 4, verticalAlign: "middle" }}
                        />
                      ) : null}
                      {isCurrentUser(u) ? <span className="choice-chip is-active">Bạn đang đăng nhập nick này</span> : null}
                    </div>
                    <p className="row-meta">@{u.username} · 🪙 {formatCandy(u.gem_balance || 0)} Coin · 👥 {(u.followers_count || 0).toLocaleString()}</p>
                    {u.is_banned ? (
                      <p style={{ color: "var(--destructive)", fontSize: "0.8rem", margin: 0 }}>
                        🚫 Bị cấm đến {u.banned_until ? new Date(u.banned_until).toLocaleDateString("vi") : "?"}
                      </p>
                    ) : null}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>🎖 Danh hiệu GIF:</span>
                      <select
                        className="app-input"
                        style={{ padding: "4px 8px", fontSize: "0.78rem", maxWidth: 180 }}
                        value={u.title_gif_url || ""}
                        onChange={(e) => void handleAssignTitleGif(u, e.target.value || null)}
                      >
                        <option value="">— Không có —</option>
                        {titleGifs.map((t) => (
                          <option key={t.name} value={t.url}>{t.label}</option>
                        ))}
                      </select>
                      {u.title_gif_url ? (
                        <button
                          className="secondary-cta compact danger-button"
                          style={{ padding: "4px 8px", fontSize: "0.72rem" }}
                          onClick={() => void handleAssignTitleGif(u, null)}
                          title="Xóa danh hiệu"
                        >
                          <Trash2 size={12} /> Xóa danh hiệu
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <button className="choice-chip" onClick={() => setSelectedUser(u)}>Chi tiết</button>
                </div>
              </div>
            ))}
          </div>

          {selectedUser ? (
            <div className="modal-backdrop" onClick={() => setSelectedUser(null)}>
              <div className="modal-panel modal-compact" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header" style={{ padding: "10px 14px" }}>
                  <h3 className="section-title" style={{ fontSize: "1rem", margin: 0 }}>
                    👤 {selectedUser.full_name || selectedUser.username}
                  </h3>
                  <button className="icon-button" onClick={() => setSelectedUser(null)}><X size={16} /></button>
                </div>
                <div className="modal-body" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Tóm tắt 1 dòng */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                    <span>@{selectedUser.username}</span>
                    <span>· 🪙 {formatCandy(selectedUser.gem_balance || 0)} Coin</span>
                    <span>· 👥 {(selectedUser.followers_count || 0).toLocaleString()}</span>
                    <span>· {isCurrentUser(selectedUser) ? "✅ Nick đang đăng nhập" : "⚠️ Khác nick đăng nhập"}</span>
                  </div>

                  {/* GRID 2 cột: Buff Coin | Buff follower */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="panel" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600 }}><Gift size={12} /> Coin (≤999M)</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <input className="app-input" style={{ padding: "4px 6px", fontSize: "0.78rem" }} type="number" placeholder="999999" max={MAX_CANDY} value={buffCandy} onChange={(e) => setBuffCandy(e.target.value)} />
                        <button className="primary-cta compact" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={() => void handleBuffCandy(selectedUser.id)}>OK</button>
                      </div>
                    </div>
                    <div className="panel" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600 }}><Users size={12} /> Follower ảo (≤1k)</span>
                      <div style={{ display: "flex", gap: 4 }}>
                      <input
                        className="app-input"
                        style={{ padding: "4px 6px", fontSize: "0.78rem" }}
                        type="number"
                        placeholder="250"
                        min={1}
                        max={1000}
                        value={buffFollowers}
                        disabled={buffing}
                        onChange={(e) => setBuffFollowers(e.target.value)}
                      />
                      <button
                        className="primary-cta compact"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                        disabled={buffing}
                        onClick={() => void handleBuffFollowers(selectedUser.id)}
                      >
                        {buffing ? "…" : "OK"}
                      </button>
                      </div>
                    </div>
                  </div>

                  {/* VIP % chia 3 cột nhỏ gọn */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, padding: 8, borderRadius: 8, background: "oklch(0.97 0.02 350)", border: "1px solid oklch(0.92 0.05 350)" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: "0.68rem" }}>💎 KC %</span>
                      <input className="app-input" style={{ padding: "3px 6px", fontSize: "0.75rem" }} type="number" min={0} max={100} value={vipDiamondPct} disabled={buffing} onChange={(e) => setVipDiamondPct(e.target.value)} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: "0.68rem" }}>🥇 Vàng %</span>
                      <input className="app-input" style={{ padding: "3px 6px", fontSize: "0.75rem" }} type="number" min={0} max={100} value={vipGoldPct} disabled={buffing} onChange={(e) => setVipGoldPct(e.target.value)} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: "0.68rem" }}>🥈 Bạc %</span>
                      <input className="app-input" style={{ padding: "3px 6px", fontSize: "0.75rem" }} type="number" min={0} max={100} value={vipSilverPct} disabled={buffing} onChange={(e) => setVipSilverPct(e.target.value)} />
                    </label>
                  </div>

                  {buffProgress ? (
                    <p className="row-meta" style={{ margin: 0, fontSize: "0.72rem" }}>⏳ {buffProgress.done.toLocaleString()} / {buffProgress.total.toLocaleString()}</p>
                  ) : null}
                  {buffError ? (
                    <p className="row-meta" style={{ margin: 0, color: "var(--destructive)", fontSize: "0.72rem" }}>{buffError}</p>
                  ) : null}

                  <ProfileStickerPicker userId={selectedUser.id} />

                  {/* Hành động ban / xóa: grid 2 cột */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {!selectedUser.is_banned ? (
                      <button className="secondary-cta compact danger-button" style={{ padding: "6px 8px", fontSize: "0.75rem", justifyContent: "center" }} onClick={() => void handleBan(selectedUser.id, 15)}><Ban size={12} /> Cấm 15 ngày</button>
                    ) : (
                      <button className="secondary-cta compact" style={{ padding: "6px 8px", fontSize: "0.75rem", justifyContent: "center" }} onClick={() => void handleUnban(selectedUser.id)}>Gỡ cấm</button>
                    )}
                    <button className="secondary-cta compact danger-button" style={{ padding: "6px 8px", fontSize: "0.75rem", justifyContent: "center" }} onClick={() => void handleDeleteUser(selectedUser.id)}><Trash2 size={12} /> Xóa tài khoản</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {tab === "titles" && (
        <div className="stack-md">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleUploadTitlesFromInput(e.dataTransfer.files);
            }}
            style={{
              border: `2px dashed ${dragOver ? "var(--primary)" : "oklch(0.85 0.05 350)"}`,
              borderRadius: 14,
              padding: 24,
              textAlign: "center",
              background: dragOver ? "oklch(0.97 0.04 350)" : "oklch(0.99 0.01 350)",
              transition: "all 0.15s",
            }}
          >
            <input
              ref={titleFileInputRef}
              type="file"
              accept=".gif,.webp,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => void handleUploadTitlesFromInput(e.target.files)}
            />
            <Upload size={28} style={{ opacity: 0.6, marginBottom: 8 }} />
            <p className="row-title" style={{ marginBottom: 4 }}>
              Tải lên danh hiệu mới
            </p>
            <p className="row-meta" style={{ marginBottom: 12 }}>
              Kéo & thả file vào đây, hoặc bấm nút bên dưới. Chỉ chấp nhận {TITLES_ALLOWED_EXT.join(", ")}.
            </p>
            <button
              className="primary-cta compact"
              disabled={uploadingTitle}
              onClick={() => titleFileInputRef.current?.click()}
            >
              <Upload size={14} /> {uploadingTitle ? "Đang tải lên…" : "Tải lên GIF mới"}
            </button>
          </div>

          <div className="inline-flex items-center justify-between">
            <p className="row-meta">
              Tổng: <strong>{titleGifs.length}</strong> danh hiệu trong hệ thống.
            </p>
            <button className="choice-chip" onClick={() => void loadTitleGifs()}>
              ↻ Làm mới
            </button>
          </div>

          {titlesLoading ? (
            <div className="empty-state">Đang tải…</div>
          ) : titleGifs.length === 0 ? (
            <div className="empty-state">
              Chưa có danh hiệu nào. Hãy tải lên file <code>.gif</code> hoặc <code>.webp</code> đầu tiên.
              <br />
              <small className="muted-copy">
                ⚠️ Nếu lỗi storage → chạy file <code>docs/MIGRATION_TITLES_BUCKET.sql</code> trong Supabase.
              </small>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              {titleGifs.map((g) => (
                <div
                  key={g.name}
                  className="panel"
                  style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 90,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "oklch(0.97 0.01 350)",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <img decoding="async"
                      src={g.url}
                      alt={g.label}
                      loading="lazy"
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </div>
                  <span
                    className="row-meta"
                    style={{ fontSize: "0.72rem", textAlign: "center", wordBreak: "break-word", lineHeight: 1.2 }}
                  >
                    {g.label}
                  </span>
                  <button
                    className="secondary-cta compact danger-button"
                    style={{ padding: "4px 8px", fontSize: "0.72rem", width: "100%" }}
                    onClick={() => void handleDeleteTitleGif(g)}
                  >
                    <Trash2 size={12} /> Xóa vĩnh viễn
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "posts" && (
        <div className="stack-sm">
          {posts.length === 0 ? <p className="muted-copy">Không có bài viết nào.</p> : null}
          {posts.map((p: any) => (
            <div key={p.id} className="panel" style={{ padding: 14 }}>
              <div className="list-row">
                <div className="grow">
                  <p className="row-title">
                    {resolveUserName(p.profiles as any, "Người dùng")}
                  </p>
                  <p className="row-meta" style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.content || "(ảnh)"}
                  </p>
                </div>
                <button className="icon-button danger-button" onClick={() => void handleDeletePost(p.id)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "vnicks" && (
        <div className="stack-md">
          <div className="rounded-3xl" style={{ padding: 16, background: "var(--card, white)", border: "1px solid var(--border)" }}>
            <h3 className="section-title" style={{ marginTop: 0 }}>✨ Tạo nick ảo mới</h3>
            <div className="inline-flex flex-wrap gap-2" style={{ marginBottom: 12 }} role="tablist" aria-label="Loại nick ảo">
              {VN_CATEGORIES.map((c) => {
                const active = vnCategory === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setVnCategory(c.id)}
                    className="rounded-3xl"
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.85rem",
                      fontWeight: active ? 700 : 500,
                      border: active ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                      background: active ? "hsl(var(--primary) / 0.12)" : "transparent",
                      color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                      cursor: "pointer",
                      transition: "all .2s ease",
                    }}
                  >
                    {c.id === "ons" ? "🔥 Tìm ONS" : c.id === "fwb" ? "✨ Tìm FWB" : "❤️ Tìm Người Yêu"}
                  </button>
                );
              })}
            </div>
            <p className="row-meta" style={{ margin: "0 0 8px" }}>
              Đang tạo nick cho mục: <strong>{vnCategory === "ons" ? "Tìm ONS" : vnCategory === "fwb" ? "Tìm FWB" : "Tìm Người Yêu"}</strong>. Category sẽ tự gán khi lưu.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center" }}>
              <img loading="lazy" decoding="async" src={avatarSrc(vnAvatar || "/placeholder.svg", 72)} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold-400, gold)" }} />
              <div className="stack-xs">
                <input className="app-input" placeholder="URL avatar" value={vnAvatar} onChange={(e) => setVnAvatar(e.target.value)} />
                <button type="button" className="choice-chip" onClick={() => setVnAvatar(pickFakeAvatar())}>🎲 Avatar ngẫu nhiên</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              <label className="field-label"><span>Tên hiển thị</span>
                <input className="app-input" value={vnName} onChange={(e) => setVnName(e.target.value)} placeholder="VD: Mai Anh" />
              </label>
              <label className="field-label"><span>Khu vực</span>
                <input className="app-input" value={vnProvince} onChange={(e) => setVnProvince(e.target.value)} placeholder="VD: Hà Nội" />
              </label>
              <label className="field-label"><span>Giới tính</span>
                <select className="app-input" value={vnGender} onChange={(e) => setVnGender(e.target.value as any)}>
                  <option value="female">Nữ</option>
                  <option value="male">Nam</option>
                </select>
              </label>
            </div>
            <div className="inline-flex gap-2" style={{ marginTop: 12 }}>
              <button className="secondary-cta compact" onClick={fillRandomVnick}>🎲 Random tên + avatar</button>
              <button className="primary-cta compact" onClick={() => void createVNick()} disabled={vnCreating}>
                <Plus size={14} /> {vnCreating ? "Đang tạo…" : "Tạo nick ảo"}
              </button>
            </div>
          </div>

          <div className="inline-flex items-center justify-between flex-wrap gap-2">
            <strong>Danh sách nick ảo: {vnList.length}</strong>
            <div className="inline-flex gap-2">
              {(["all", "ons", "fwb", "dating"] as const).map((f) => (
                <button key={f} className={`choice-chip ${vnFilter === f ? "is-active" : ""}`} onClick={() => setVnFilter(f)}>
                  {f === "all" ? "Tất cả" : f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {vnLoading ? (
            <div className="empty-state">Đang tải…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {vnList
                .filter((vn) => {
                  if (vnFilter === "all") return true;
                  const cat = vn.intent === "fwb" ? "fwb" : (vn.intent === "serious" || vn.intent === "dating") ? "dating" : "ons";
                  return cat === vnFilter;
                })
                .map((vn) => {
                  const cat = vn.intent === "fwb" ? "fwb" : (vn.intent === "serious" || vn.intent === "dating") ? "dating" : "ons";
                  return (
                    <div key={vn.id} className="panel" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: 12 }}>
                      <img loading="lazy" decoding="async" src={avatarSrc(vn.avatar || "/placeholder.svg", 64)} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {vn.full_name || vn.username}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                          @{vn.username} · {vn.province || "—"} · {cat.toUpperCase()}
                        </div>
                      </div>
                      <button className="secondary-cta compact" onClick={() => void postFakePost(vn)} disabled={vnPosting === vn.id} title="Đăng bài ảo">
                        <Send size={12} /> {vnPosting === vn.id ? "..." : "Đăng bài"}
                      </button>
                      <button className="icon-button danger-button" onClick={() => void deleteVNick(vn)} title="Xóa">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              {vnList.length === 0 ? <div className="empty-state">Chưa có nick ảo nào.</div> : null}
            </div>
          )}
        </div>
      )}

      {tab === "fakes" && (
        <div className="stack-md">
          <div className="inline-flex items-center justify-between flex-wrap gap-2">
            <p className="row-meta">
              Tổng: <strong>{fakeList.length}</strong> nick ảo. Khu vực để trống = "linh hoạt" (tự match khu vực user xem).
            </p>
            <div className="inline-flex items-center gap-2 flex-wrap">
              <button
                className="secondary-cta compact"
                style={{
                  background: "hsl(0 70% 96%)",
                  color: "hsl(0 70% 40%)",
                  borderColor: "hsl(0 70% 80%)",
                }}
                onClick={() => setConfirmDeleteAllFakes(true)}
                disabled={deletingAllFakes}
              >
                <Trash2 size={14} /> Xóa tất cả tài khoản ảo
              </button>
              <button
                className="primary-cta compact"
                onClick={() => setFakeEdit(newFakeDraft())}
              >
                <Plus size={14} /> Tạo nick ảo
              </button>
            </div>
          </div>

          {fakeLoading ? (
            <div className="empty-state">Đang tải…</div>
          ) : fakeList.length === 0 ? (
            <div className="empty-state">
              Chưa có nick ảo nào. Bấm "Tạo nick ảo" để bắt đầu.
              <br />
              <small className="muted-copy">
                ⚠️ Nếu lỗi "fake_profiles does not exist" → chạy file <code>docs/sql/fwb_fake_profiles.sql</code> trên Supabase.
              </small>
            </div>
          ) : (
            <div className="fp-admin-grid">
              {fakeList.map((p) => (
                <div key={p.id} className="fp-admin-card">
                  <img loading="lazy" decoding="async" src={avatarSrc(p.avatar_url || p.avatar || "/placeholder.svg", 64)} alt="" />
                  <div className="fp-admin-meta">
                    <span className="fp-admin-name">
                      {p.display_name || p.full_name || p.username}
                    </span>
                    <span className="fp-admin-sub">
                      @{p.username} · VIP {p.vip_level ?? 0} · {p.province || "linh hoạt"}
                    </span>
                  </div>
                  <button className="icon-button" onClick={() => setFakeEdit(p)} title="Sửa">
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button danger-button"
                    onClick={() => void removeFake(p.id)}
                    title="Xóa"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {fakeEdit && (
        <div className="modal-backdrop" onClick={() => setFakeEdit(null)}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460 }}
          >
            <div className="modal-header">
              <h3 className="section-title">
                {fakeEdit.id ? "✏️ Sửa nick ảo" : "✨ Tạo nick ảo mới"}
              </h3>
              <button className="icon-button" onClick={() => setFakeEdit(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body stack-sm">
              <div className="inline-flex items-center gap-3">
                <img loading="lazy" decoding="async"
                  src={avatarSrc(fakeEdit.avatar_url || "/placeholder.svg", 64)}
                  alt=""
                  style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold-400)" }}
                />
                <div className="stack-xs grow">
                  <input
                    className="app-input"
                    placeholder="URL avatar"
                    value={fakeEdit.avatar_url || ""}
                    onChange={(e) => setFakeEdit({ ...fakeEdit, avatar_url: e.target.value })}
                  />
                  <button
                    type="button"
                    className="choice-chip"
                    onClick={() => setFakeEdit({ ...fakeEdit, avatar_url: pickFakeAvatar() })}
                  >
                    🎲 Đổi avatar ngẫu nhiên
                  </button>
                </div>
              </div>

              <label className="field-label">
                <span>Username (không trùng)</span>
                <input
                  className="app-input"
                  value={fakeEdit.username || ""}
                  onChange={(e) => setFakeEdit({ ...fakeEdit, username: e.target.value })}
                />
              </label>

              <label className="field-label">
                <span>Tên hiển thị</span>
                <input
                  className="app-input"
                  value={fakeEdit.display_name || ""}
                  onChange={(e) => setFakeEdit({ ...fakeEdit, display_name: e.target.value })}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label className="field-label">
                  <span>Cấp VIP ảo</span>
                  <select
                    className="app-input"
                    value={fakeEdit.vip_level ?? 0}
                    onChange={(e) => setFakeEdit({ ...fakeEdit, vip_level: parseInt(e.target.value, 10) })}
                  >
                    <option value={0}>0 — Thường</option>
                    <option value={2}>2 — Bạc</option>
                    <option value={5}>5 — Vàng</option>
                    <option value={10}>10 — Kim cương</option>
                  </select>
                </label>
                <label className="field-label">
                  <span>Coin</span>
                  <input
                    className="app-input"
                    type="number"
                    min={0}
                    value={typeof fakeEdit.gem_balance === "number" ? fakeEdit.gem_balance : 0}
                    onChange={(e) => setFakeEdit({ ...fakeEdit, gem_balance: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  />
                </label>
                <label className="field-label">
                  <span>Locale</span>
                  <select
                    className="app-input"
                    value={(fakeEdit.locale as string) || "vi"}
                    onChange={(e) => setFakeEdit({ ...fakeEdit, locale: e.target.value })}
                  >
                    <option value="vi">vi 🇻🇳</option>
                    <option value="ja">ja 🇯🇵</option>
                    <option value="ko">ko 🇰🇷</option>
                    <option value="en">en 🇬🇧</option>
                    <option value="zh">zh 🇨🇳</option>
                  </select>
                </label>
              </div>

              <label className="field-label">
                <span>Khu vực (để trống = linh hoạt, hiển thị theo khu vực của user xem)</span>
                <input
                  className="app-input"
                  placeholder="VD: Bình Dương — hoặc bỏ trống"
                  value={(fakeEdit.province as string) || ""}
                  onChange={(e) => setFakeEdit({ ...fakeEdit, province: e.target.value })}
                />
              </label>

              <label className="field-label">
                <span>Bio (tuỳ chọn)</span>
                <textarea
                  className="app-input"
                  rows={2}
                  value={fakeEdit.bio || ""}
                  onChange={(e) => setFakeEdit({ ...fakeEdit, bio: e.target.value })}
                />
              </label>

              <div className="inline-flex gap-2 justify-end">
                <button className="secondary-cta compact" onClick={() => setFakeEdit(null)}>
                  Hủy
                </button>
                <button className="primary-cta compact" disabled={fakeSaving} onClick={() => void saveFake()}>
                  {fakeSaving ? "Đang lưu…" : "Lưu nick ảo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "game" && (
        <div className="panel stack-md" style={{ padding: 18 }}>
          <h3 className="section-title"><Shield size={16} /> Điều khiển kết quả Tài Xỉu</h3>
          <p className="muted-copy">Chọn kết quả cho các phiên tiếp theo:</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["random", "tai", "xiu"] as const).map((opt) => (
              <button key={opt} className={`choice-chip ${gameControl === opt ? "is-active" : ""}`} onClick={() => setGameControl(opt)}>
                {opt === "random" ? "🎲 Ngẫu nhiên" : opt === "tai" ? "📈 Luôn TÀI" : "📉 Luôn XỈU"}
              </button>
            ))}
          </div>
          <button className="primary-cta compact" onClick={saveGameControl}>💾 Lưu cài đặt</button>
          <p className="muted-copy" style={{ fontSize: "0.75rem" }}>⚠️ Cài đặt này chỉ áp dụng trên thiết bị admin đang dùng.</p>
        </div>
      )}

      {tab === "vchat" && (
        <div className="stack-md">
          {/* ===== Tạo nick ảo nhanh ===== */}
          <div className="panel" style={{ padding: 12, border: "1px dashed oklch(0.85 0.08 350)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: "0.9rem" }}>✨ Tạo nick ảo nhanh</strong>
              <button type="button" className="choice-chip" onClick={fillRandomVcIdentity}>
                <Dices size={12} /> Random tất cả
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
              <input className="app-input" placeholder="Tên hiển thị" value={vcName} onChange={(e) => setVcName(e.target.value)} />
              <input className="app-input" placeholder="Tài khoản (username)" value={vcUsername} onChange={(e) => setVcUsername(e.target.value)} />
              <input className="app-input" placeholder="Mật khẩu" value={vcPassword} onChange={(e) => setVcPassword(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              {vcAvatarUrl.trim() ? (
                <img loading="lazy" decoding="async"
                  src={avatarSrc(vcAvatarUrl.trim(), 72)}
                  alt="preview"
                  style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid oklch(0.85 0.05 350)" }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
                />
              ) : null}
              <input
                className="app-input"
                style={{ flex: 1 }}
                placeholder="Dán link ảnh đại diện (https://...)"
                value={vcAvatarUrl}
                onChange={(e) => setVcAvatarUrl(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <textarea
                className="app-input"
                style={{ flex: 1, minHeight: 50, resize: "vertical" }}
                placeholder="Bio thả thính…"
                value={vcBio}
                onChange={(e) => setVcBio(e.target.value)}
              />
              <button type="button" className="choice-chip" onClick={() => setVcBio(pickFlirtBio())} title="Random bio">
                <Sparkles size={12} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button className="primary-cta compact" disabled={vcCreating} onClick={() => void createVirtualNick()}>
                <Plus size={14} /> {vcCreating ? "Đang tạo…" : "Tạo nick ảo"}
              </button>
            </div>
          </div>

          <div className="inline-flex items-center justify-between">
            <p className="row-meta">
              Tổng: <strong>{vThreads.length}</strong> hội thoại với nick ảo. Chưa đọc: <strong style={{ color: "var(--destructive, red)" }}>{vThreads.reduce((s, t) => s + (t.unread || 0), 0)}</strong>.
            </p>
            <button className="choice-chip" onClick={() => void loadVChat()}>↻ Làm mới</button>
          </div>

          {vLoading ? (
            <div className="empty-state">Đang tải…</div>
          ) : vThreads.length === 0 ? (
            <div className="empty-state">
              Chưa có khách nào nhắn tin cho profile ảo.
              <br />
              <small className="muted-copy">⚠️ Nếu lỗi quyền → chạy <code>docs/MIGRATION_SMART_PROFILE_SYSTEM.sql</code> trên Supabase.</small>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {vThreads.map((t) => (
                <button
                  key={`${t.virtual_id}-${t.customer_id}`}
                  className="panel"
                  style={{ padding: 10, textAlign: "left", display: "flex", gap: 8, alignItems: "center", cursor: "pointer", border: t.unread > 0 ? "2px solid var(--primary, hotpink)" : "1px solid oklch(0.92 0.05 350)" }}
                  onClick={() => void openVThread(t)}
                >
                  <img loading="lazy" decoding="async" src={avatarSrc(t.virtual?.avatar || "/placeholder.svg", 64)} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                      <strong style={{ fontSize: "0.82rem" }}>{resolveUserName(t.virtual as any, "Nick ảo")}</strong>
                      {t.unread > 0 ? <span style={{ fontSize: "0.7rem", background: "var(--destructive, red)", color: "white", padding: "1px 6px", borderRadius: 999 }}>{t.unread}</span> : null}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                      ← Khách: {resolveUserName(t.customer as any, "?")}
                    </div>
                    <div style={{ fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.last?.sender === "admin" ? "Bạn: " : ""}{t.last?.content}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {vActive ? (
            <div className="modal-backdrop" onClick={() => setVActive(null)}>
              <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header" style={{ padding: "10px 14px" }}>
                  <h3 className="section-title" style={{ fontSize: "0.95rem", margin: 0 }}>
                    💬 {vActive.virtual?.full_name || vActive.virtual?.username} ↔ {vActive.customer?.full_name || vActive.customer?.username}
                  </h3>
                  <button className="icon-button" onClick={() => setVActive(null)}><X size={16} /></button>
                </div>
                <div className="modal-body" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: 8, background: "oklch(0.97 0.01 350)", borderRadius: 8 }}>
                    {vMessages.length === 0 ? (
                      <p className="row-meta" style={{ margin: 0 }}>(chưa có tin)</p>
                    ) : null}
                    {vMessages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: m.sender === "admin" ? "flex-end" : "flex-start",
                          maxWidth: "80%",
                          padding: "6px 10px",
                          borderRadius: 12,
                          fontSize: "0.82rem",
                          background: m.sender === "admin"
                            ? "linear-gradient(135deg, oklch(0.7 0.15 350), oklch(0.65 0.18 20))"
                            : "oklch(0.96 0.02 350)",
                          color: m.sender === "admin" ? "white" : "oklch(0.18 0.04 280)",
                          border: m.sender === "admin" ? "none" : "1px solid oklch(0.85 0.04 350)",
                          fontWeight: 500,
                        }}
                      >
                        {m.content}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="app-input"
                      placeholder={`Trả lời với danh nghĩa "${vActive.virtual?.full_name || vActive.virtual?.username}"…`}
                      value={vReply}
                      onChange={(e) => setVReply(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !vSending && void sendVReply()}
                    />
                    <button className="primary-cta compact" disabled={vSending || !vReply.trim()} onClick={() => void sendVReply()}>
                      <Send size={14} /> Gửi
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {confirmDeleteAllFakes ? (
        <div className="modal-backdrop" onClick={() => !deletingAllFakes && setConfirmDeleteAllFakes(false)}>
          <div className="modal-panel modal-compact" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="section-title" style={{ color: "hsl(0 70% 45%)" }}>
                <Trash2 size={18} className="inline" /> Xác nhận xóa hàng loạt
              </h3>
            </div>
            <div className="modal-body stack-md">
              <p>
                Bạn sắp <strong>xoá vĩnh viễn TẤT CẢ tài khoản ảo</strong> trong hệ thống:
              </p>
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: "0.88rem", color: "var(--muted-foreground)" }}>
                <li>Toàn bộ nick FWB ảo (bảng <code>fake_profiles</code>)</li>
                <li>Toàn bộ profiles có cờ <code>is_virtual = true</code></li>
                <li>Follower ảo liên quan (cascade)</li>
              </ul>
              <p style={{ fontSize: "0.85rem", color: "hsl(0 70% 45%)" }}>
                ⚠️ Hành động này KHÔNG THỂ HOÀN TÁC. Hãy chắc chắn.
              </p>
              <div className="inline-flex gap-3 justify-end">
                <button
                  className="secondary-cta compact"
                  onClick={() => setConfirmDeleteAllFakes(false)}
                  disabled={deletingAllFakes}
                >
                  Huỷ
                </button>
                <button
                  className="primary-cta compact"
                  style={{ background: "hsl(0 70% 50%)", borderColor: "hsl(0 70% 50%)" }}
                  onClick={() => void deleteAllVirtualAccounts()}
                  disabled={deletingAllFakes}
                >
                  <Trash2 size={14} /> {deletingAllFakes ? "Đang xoá..." : "Xác nhận xoá tất cả"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
