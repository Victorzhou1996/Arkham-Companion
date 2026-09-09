import i18n, { type LanguageDetectorModule } from "i18next";

import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import { isArkhamHorrorMode } from "@/utils/arkham-horror-mode";

const localStorageDectector: LanguageDetectorModule = {
  type: "languageDetector",
  detect() {
    const arkhamHorrorMode = isArkhamHorrorMode();
    const fallback = arkhamHorrorMode ? "zh-cn" : "en";
    if (typeof window === "undefined") return fallback;
    const arkhamLanguage = arkhamHorrorMode ? getArkhamHorrorLocale() : null;
    if (arkhamLanguage) return arkhamLanguage;

    const lang = localStorage.getItem("i18nextLng");
    return lang || fallback;
  },
  cacheUserLanguage(lng: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem("i18nextLng", lng);
    if (isArkhamHorrorMode()) {
      localStorage.setItem("language", toArkhamHorrorLanguage(lng));
    }
  },
};

const importBackend = resourcesToBackend(
  async (lng: string, namespace: string) => {
    const bundle = await import(`@/locales/${lng}.json`);
    return bundle.default[namespace];
  },
);

i18n
  .use(localStorageDectector)
  .use(importBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    // Load the exact selected locale (e.g. `zh-cn`), not just the base language.
    // `languageOnly` would collapse `zh-cn` -> `zh`, making the simplified locale unreachable.
    load: "currentOnly",
    // Keep region subtags lower-cased so they match the lower-cased locale filenames
    // (i18next would otherwise format `zh-cn` -> `zh-CN`, which 404s on case-sensitive hosts).
    lowerCaseLng: true,
    partialBundledLanguages: true,
    showSupportNotice: false,
    resources: {
      en,
    },
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", (lng) => {
  if (document) document.documentElement.lang = lng;
});

export function changeLanguage(lng: string) {
  if (i18n.language === lng) return;
  return i18n.changeLanguage(lng);
}

export function getArkhamHorrorLocale() {
  if (typeof window === "undefined") return "zh-cn";
  const lng = localStorage.getItem("language");
  if (!lng) return "zh-cn";
  return lng.toLowerCase().startsWith("zh") ? "zh-cn" : lng.toLowerCase();
}

function toArkhamHorrorLanguage(lng: string) {
  return lng.toLowerCase().startsWith("zh") ? "zh" : lng.toLowerCase();
}

export default i18n;
