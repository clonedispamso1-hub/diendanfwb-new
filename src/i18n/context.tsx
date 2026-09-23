import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANGUAGE, LANGUAGES, messages, type AppLanguage, type TranslationKey } from "./catalog";
import { syncDomLanguage } from "./dom-translate";

const STORAGE_KEY = "fwb_language";
const COOKIE_KEY = "fwb_lang";
const valid = (value: string | null): value is AppLanguage => LANGUAGES.some((item) => item.code === value);

type LanguageContextValue = { language: AppLanguage; setLanguage: (language: AppLanguage) => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<LanguageContextValue>({ language: DEFAULT_LANGUAGE, setLanguage: () => undefined, t: (key) => messages.vi[key] });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const cookie = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_KEY}=`))?.split("=")[1] ?? null;
    const initial = valid(stored) ? stored : valid(cookie) ? cookie : DEFAULT_LANGUAGE;
    setLanguageState(initial);
  }, []);
  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(next)}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);
  useEffect(() => {
    const meta = LANGUAGES.find((item) => item.code === language);
    document.documentElement.lang = meta?.htmlLang ?? "vi";
    syncDomLanguage(language);
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: TranslationKey) => messages[language][key] }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
