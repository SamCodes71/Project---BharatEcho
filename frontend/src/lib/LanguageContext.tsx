// src/lib/LanguageContext.tsx
//
// Provides the dashboard UI language ("en" | "hi").
// Language preference is persisted to localStorage AND synced with the
// backend settings so it survives a page reload.
//
// Usage:
//   const { lang, setLang, t } = useLang();
//   <h1>{t("nav_overview")}</h1>

import {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from "react";
import { t as translate, translations, Lang, TranslationKey } from "./i18n";
import { apiGet, apiPost } from "./fetch";

interface LangContextValue {
  lang:    Lang;
  setLang: (l: Lang) => void;
  /** Translate a key using the current language. */
  t:       (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue>({
  lang:    "en",
  setLang: () => {},
  t:       (k) => translate(k, "en"),
});

const LS_KEY = "bharatecho_ui_lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LS_KEY);
    return (saved === "hi" ? "hi" : "en") as Lang;
  });

  // On mount, fetch backend settings and use ui_language if set
  useEffect(() => {
    apiGet("/api/settings")
      .then((s: any) => {
        if (s?.ui_language === "Hindi") {
          setLangState("hi");
          localStorage.setItem(LS_KEY, "hi");
        } else if (s?.ui_language === "English") {
          setLangState("en");
          localStorage.setItem(LS_KEY, "en");
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
    // Also persist to backend settings so other tabs/reloads pick it up
    const uiLang = l === "hi" ? "Hindi" : "English";
    apiPost("/api/settings", { updates: { ui_language: uiLang } }).catch(() => {});
  }, []);

  const tFn = useCallback(
    (key: TranslationKey) => translate(key, lang),
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t: tFn }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
