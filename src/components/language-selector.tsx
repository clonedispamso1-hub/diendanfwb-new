import { useEffect, useRef, useState } from "react";
import { Check, Languages, X } from "lucide-react";
import { LANGUAGES } from "@/i18n/catalog";
import { useLanguage } from "@/i18n/context";

const MENU_LANGUAGES = ["vi", "zh-TW", "zh-CN", "ja", "en"].map((code) =>
  LANGUAGES.find((item) => item.code === code),
).filter((item): item is (typeof LANGUAGES)[number] => Boolean(item));

function FlagIcon({ code }: { code: (typeof LANGUAGES)[number]["code"] }) {
  return <span className={`language-selector__flag flag-${code.toLowerCase()}`} aria-hidden="true" />;
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((item) => item.code === language) ?? LANGUAGES[0];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div className={`language-selector${open ? " is-open" : ""}`} ref={root} data-no-translate>
    {open ? <div className="language-selector__menu" role="menu" aria-label={t("chooseLanguage")}>
      <div className="language-selector__heading"><Languages size={15}/><span>{t("language")}</span><button type="button" onClick={() => setOpen(false)} aria-label={t("closeLanguage")}><X size={15}/></button></div>
      {MENU_LANGUAGES.map((item) => <button key={item.code} type="button" role="menuitemradio" aria-checked={item.code === language} className={item.code === language ? "is-active" : ""} onClick={() => { setLanguage(item.code); setOpen(false); }}><FlagIcon code={item.code} /><span>{item.name}</span>{item.code === language ? <Check size={15}/> : null}</button>)}
    </div> : null}
    <button type="button" className="language-selector__trigger" aria-haspopup="menu" aria-expanded={open} aria-label={`${t("chooseLanguage")}: ${current.name}`} title={current.name} onClick={() => setOpen((value) => !value)}><FlagIcon code={current.code} /></button>
  </div>;
}
