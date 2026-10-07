import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Check, Search } from "lucide-react";
import { CountryFlag, type CountryFlagType } from "@/components/candy/country-flag";
import { SeverTransitionOverlay } from "@/components/candy/sever-transition-overlay";
import { SeverLockPopup } from "@/components/candy/sever-lock-popup";
import { SeverFlowModal } from "@/components/candy/sever-flow-modal";
import { SeverReturnOverlay } from "@/components/candy/sever-return-overlay";
import { SEVERS, regionsOfSever, searchServerRegions, stableOnlineCount, type SeverId } from "@/lib/server-regions";

const STORAGE_KEY = "feed:sever";

interface Selection { sever: SeverId; region: string | null }

/** Header badge that opens a compact Sever → region menu. UI-only state. */
export function SeverPicker() {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState<SeverId | null>(null);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Selection>({ sever: "mixed", region: null });
  const [transition, setTransition] = useState<string | null>(null);
  // Sever khu vực đều bị khóa: lưu khu vực vừa bấm để hiện popup sau loading.
  const [pendingLock, setPendingLock] = useState<{ sever: SeverId; location: string } | null>(null);
  const [lock, setLock] = useState<{ sever: SeverId; location: string } | null>(null);
  const [returning, setReturning] = useState(false);
  const busy = Boolean(transition || pendingLock || lock || returning);
  const busyRef = useRef(false);
  const closeTransition = useCallback(() => {
    setTransition(null);
    setLock(pendingLock);
    setPendingLock(null);
    if (!pendingLock) busyRef.current = false;
  }, [pendingLock]);

  // Lọc khu vực hoàn toàn client-side; số Online là giả lập deterministic (client-only).
  const visibleRegions = useMemo(
    () => (browsing ? searchServerRegions(regionsOfSever(browsing), query) : []),
    [browsing, query],
  );

  // Read storage after hydration only.
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (v && v.sever !== "mixed") {
        // Không giữ lại Sever khu vực cũ sau reload: luôn về Hỗn Tạp.
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ sever: "mixed", region: null }));
        window.dispatchEvent(new CustomEvent("feed:sever-change", { detail: { sever: "mixed", region: null } }));
      }
    } catch { /* */ }
  }, []);

  // Badge + menu là MỘT cụm: header ẩn khi scroll xuống (data-scroll-nav-state="down")
  // thì menu phải đóng ngay theo, không nổi lại trên Feed. Scroll lên không tự mở lại.
  useEffect(() => {
    if (!open) return;
    const closeIfHidden = () => {
      if (document.body.getAttribute("data-scroll-nav-state") === "down") {
        setOpen(false);
        setBrowsing(null);
      }
    };
    closeIfHidden();
    const mo = new MutationObserver(closeIfHidden);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-nav-state"] });
    return () => mo.disconnect();
  }, [open]);

  const choose = (next: Selection) => {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    if (next.sever !== "mixed") {
      // Khóa toàn bộ Sever khu vực: chỉ chạy loading rồi hiện popup, không chuyển.
      const loc = next.region ?? (SEVERS.find((s) => s.id === next.sever)?.label ?? next.sever);
      setOpen(false);
      setBrowsing(null);
      setPendingLock({ sever: next.sever, location: loc });
      setTransition(loc);
      return;
    }
    // Sever Hỗn Tạp: chuyển client-side thuần túy — chỉ cập nhật state, đóng menu,
    // không reload, không điều hướng, không màn loading.
    setSel(next);
    setOpen(false);
    setBrowsing(null);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent("feed:sever-change", { detail: next }));
    busyRef.current = false;
  };

  const beginReturn = useCallback(() => {
    setLock(null);
    setReturning(true);
  }, []);

  const returnToMixed = useCallback(() => {
    const mixed: Selection = { sever: "mixed", region: null };
    setSel(mixed);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mixed)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent("feed:sever-change", { detail: mixed }));
    setReturning(false);
    busyRef.current = false;
  }, []);

  const current = SEVERS.find((s) => s.id === sel.sever) ?? SEVERS[0];
  const label = sel.sever === "mixed" ? "Sever Hỗn Tạp" : sel.region ?? current.label;

  return (
    <>
      <button
        type="button"
        className="app-header__community-badge"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={busy}
        onClick={() => { if (!busyRef.current && !busy) setOpen((v) => !v); }}
      >
        <span className="app-header__community-led" aria-hidden="true" />
        {sel.sever !== "mixed" ? <CountryFlag country={sel.sever} className="sever-menu__flag app-header__sever-flag" /> : <span aria-hidden="true">🌍</span>}
        <span>{label}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="sever-menu__backdrop" onClick={() => { setOpen(false); setBrowsing(null); }}>
              <div className="sever-menu" role="dialog" aria-label="Chọn Sever" onClick={(e) => e.stopPropagation()}>
                {browsing ? (
                  <>
                    <div className="sever-menu__head">
                      <button type="button" className="sever-menu__back" aria-label="Quay lại" onClick={() => { setBrowsing(null); setQuery(""); }}>
                        <ChevronLeft size={16} />
                      </button>
                      {browsing && browsing !== "mixed" ? <CountryFlag country={browsing} className="sever-menu__flag" /> : null}
                      <span>{SEVERS.find((s) => s.id === browsing)?.label}</span>
                    </div>
                    <div className="sever-menu__search">
                      <Search size={13} aria-hidden="true" />
                      <input
                        type="text"
                        value={query}
                        placeholder="Tìm kiếm khu vực…"
                        aria-label="Tìm kiếm khu vực"
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <div className="sever-menu__list">
                      {visibleRegions.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`sever-menu__item${sel.sever === browsing && sel.region === r ? " is-active" : ""}`}
                          onClick={() => choose({ sever: browsing, region: r })}
                        >
                          <span className="sever-menu__row">
                            <span className="sever-menu__name">{r}</span>
                            <span className="sever-menu__vip">VIP</span>
                            <span className="sever-menu__online">
                              <span className="sever-menu__online-dot" aria-hidden="true" />
                              {stableOnlineCount(browsing, r)} Online
                            </span>
                          </span>
                          {sel.sever === browsing && sel.region === r ? <Check size={14} /> : null}
                        </button>
                      ))}
                      {visibleRegions.length === 0 ? (
                        <div className="sever-menu__empty">Không tìm thấy khu vực</div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sever-menu__head"><span>Chọn Sever</span></div>
                    <div className="sever-menu__list">
                      {SEVERS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`sever-menu__item${sel.sever === s.id ? " is-active" : ""}`}
                          onClick={() => { if (busyRef.current || busy) return; if (s.id === "mixed") choose({ sever: "mixed", region: null }); else { setBrowsing(s.id); setQuery(""); } }}
                        >
                          <span className="sever-menu__row">
                            {s.id === "mixed"
                              ? <span className="sever-menu__globe" aria-hidden>🌍</span>
                              : <CountryFlag country={s.id} className="sever-menu__flag" />}
                            <span className="sever-menu__name">{s.label}</span>
                            {s.id !== "mixed" ? <span className="sever-menu__vip">VIP</span> : null}
                          </span>
                          {sel.sever === s.id ? <Check size={14} /> : null}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
      {busy ? <SeverFlowModal>{(portalTarget) => <>
        {transition ? <SeverTransitionOverlay region={transition} onClose={closeTransition} portalTarget={portalTarget} /> : null}
        {lock ? <SeverLockPopup location={lock.location} country={lock.sever as CountryFlagType} onReturnToMixed={beginReturn} portalTarget={portalTarget} /> : null}
        {returning ? <SeverReturnOverlay onComplete={returnToMixed} portalTarget={portalTarget} /> : null}
      </>}</SeverFlowModal> : null}
    </>
  );
}
