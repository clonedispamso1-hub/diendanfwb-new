import { useEffect, useRef, useState } from "react";
import { isLockedUserId } from "@/lib/locked-accounts";
import { Search, UserRound, X, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import UniversalBadge from "@/components/candy/universal-badge";
import { AvatarGlow } from "@/components/candy/avatar-glow";

import { read3 } from "@/lib/content-db";
import { resolveUserName } from "@/lib/user-name";
import { fetchFollowerCounts } from "@/lib/follower-counts";
interface SearchResult {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  public_id: string | null;
  followers_count?: number;
}

interface PostResult {
  id: string;
  post_code: string;
  content: string | null;
}

interface UserSearchProps {
  onViewProfile: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
}

// Mã bài viết: POST + chữ/số (3–32 ký tự), không khoảng trắng.
const POST_CODE_REGEX = /^POST[A-Z0-9]{3,32}$/i;

export function UserSearch({ onViewProfile, onOpenPost }: UserSearchProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [postResults, setPostResults] = useState<PostResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search — 500ms + min length 2 để chống brute-force enumeration UID.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = keyword.trim();
    if (!term || term.length < 2) {
      setResults([]);
      setPostResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      // Nếu là mã bài viết → tìm theo post_code (chính xác, không LIKE để chống enumeration).
      if (POST_CODE_REGEX.test(term)) {
        const code = term.toUpperCase();
        const { data, error } = await read3()
          .from("posts")
          .select("id, post_code, content, user_id")
          .is("deleted_at", null)
          .eq("post_code", code)
          .limit(1);
        if (error) {
          console.error("Post search error:", error.message);
          setPostResults([]);
        } else {
          // Anti Clone: bài của tài khoản đang bị khóa không hiện ở Tìm kiếm.
          setPostResults(
            (((data as unknown as (PostResult & { user_id?: string })[]) ?? []).filter(
              (p) => !isLockedUserId(p.user_id),
            )) as PostResult[],
          );
        }
        setResults([]);
        setLoading(false);
        return;
      }

      const safe = term.replace(/[%_]/g, "\\$&");
      // Chỉ select các field công khai tối thiểu — KHÔNG trả gem_balance/email.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar, public_id, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province")
        // Chỉ tìm theo UID (public_id) và Tên hiển thị — username là private.
        .or(`full_name.ilike.%${safe}%,public_id.ilike.%${safe}%`)
        .limit(10);

      if (error) {
        console.error("Search error:", error.message);
        setResults([]);
      } else {
        const rows = ((data as unknown as SearchResult[]) ?? []).filter(
          (u) => !isLockedUserId(u.id),
        );
        setResults(rows);
        // Bổ sung số người đang theo dõi (đọc thật từ bảng `follows`).
        if (rows.length) {
          const counts = await fetchFollowerCounts(rows.map((u) => u.id));
          setResults(rows.map((u) => ({ ...u, followers_count: counts.get(u.id) ?? 0 })));
        }
      }
      setPostResults([]);
      setLoading(false);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword]);

  const handlePick = (id: string) => {
    setOpen(false);
    setKeyword("");
    setResults([]);
    setPostResults([]);
    onViewProfile(id);
  };

  const handlePickPost = (postId: string) => {
    setOpen(false);
    setKeyword("");
    setResults([]);
    setPostResults([]);
    if (onOpenPost) onOpenPost(postId);
    else toast("Đã tìm thấy bài viết, nhưng chưa mở được từ đây.");
  };

  const isPostQuery = POST_CODE_REGEX.test(keyword.trim());
  const [focused, setFocused] = useState(false);

  return (
    <div className="user-search" ref={containerRef}>
      <div className={`user-search-input-wrap${focused ? " is-focused" : ""}`}>
        <span className="user-search-mascot" aria-hidden="true">🐱</span>
        <Search size={16} className="user-search-icon" />
        <input
          className="user-search-input"
          type="text"
          value={keyword}
          placeholder="Tìm theo tên hoặc mã bài viết (POST…)"
          onChange={(e) => {
            setKeyword(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
        />
        {keyword ? (
          <button
            className="user-search-clear"
            type="button"
            onClick={() => {
              setKeyword("");
              setResults([]);
              setPostResults([]);
            }}
            aria-label="Xoá"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>


      {open && keyword.trim() ? (
        <div className="user-search-dropdown">
          {loading ? (
            <div className="user-search-state">Đang tìm...</div>
          ) : isPostQuery ? (
            postResults.length === 0 ? (
              <div className="user-search-state">Không tìm thấy bài viết với mã này.</div>
            ) : (
              postResults.map((p) => (
                <div key={p.id} className="user-search-item">
                  <span
                    className="user-search-avatar"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "color-mix(in srgb, var(--primary) 14%, transparent)",
                      color: "var(--primary)",
                    }}
                  >
                    <FileText size={18} />
                  </span>
                  <div className="user-search-meta">
                    <div className="user-search-name">{p.post_code}</div>
                    <div className="user-search-sub" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.content ? p.content.slice(0, 80) : "Bài viết"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="user-search-action"
                    onClick={() => handlePickPost(p.id)}
                  >
                    Mở bài viết
                  </button>
                </div>
              ))
            )
          ) : results.length === 0 ? (
            <div className="user-search-state">Không tìm thấy người dùng nào.</div>
          ) : (
            results.map((u) => {
              const name = resolveUserName(u as any, "Người dùng");
              const avatar = u.avatar || "/placeholder.svg";
              return (
                <div key={u.id} className="user-search-item">
                  <AvatarGlow
                    avatar={avatar}
                    userId={u.id}
                    size={44}
                    alt={name}
                    imgClassName="user-search-avatar"
                  />
                  <div className="user-search-meta">
                    <div className="user-search-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {name}
                      <UniversalBadge profile={u as any} />
                    </div>
                    <div className="user-search-sub">
                      <UserRound size={12} /> ID: {u.public_id || "—"}
                      {typeof u.followers_count === "number" ? (
                        <> · {u.followers_count.toLocaleString("vi-VN")} người theo dõi</>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="user-search-action"
                    onClick={() => handlePick(u.id)}
                  >
                    Xem hồ sơ
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

