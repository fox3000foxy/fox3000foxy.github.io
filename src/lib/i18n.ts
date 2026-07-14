import type { Lang } from "../i18n/types";
import { ALL_LANGS } from "../i18n/types";
import en from "../i18n/translations/en";
import fr from "../i18n/translations/fr";
import zh from "../i18n/translations/zh";
import ja from "../i18n/translations/ja";
import ko from "../i18n/translations/ko";
import tr from "../i18n/translations/tr";
import it from "../i18n/translations/it";
import de from "../i18n/translations/de";
import ru from "../i18n/translations/ru";
import es from "../i18n/translations/es";
import pt from "../i18n/translations/pt";
import id from "../i18n/translations/id";
import hi from "../i18n/translations/hi";
import ar from "../i18n/translations/ar";
import vi from "../i18n/translations/vi";
import th from "../i18n/translations/th";

const allTranslations: Record<Lang, Record<string, string>> = {
  en, fr, zh, ja, ko, tr, it, de, ru, es, pt, id, hi, ar, vi, th,
};

export type { Lang };
export { ALL_LANGS };

export const RTLLangs = new Set<Lang>(["ar"]);

export const SITE_URL = "https://fox3000foxy.com";

export const LANG_LABELS: Record<Lang, string> = {
  en: "English", fr: "Français", zh: "中文", ja: "日本語", ko: "한국어",
  tr: "Türkçe", it: "Italiano", de: "Deutsch", ru: "Русский", es: "Español",
  pt: "Português", id: "Bahasa Indonesia", hi: "हिन्दी", ar: "العربية",
  vi: "Tiếng Việt", th: "ไทย",
};

export function createT(locale: Lang) {
  const dict = allTranslations[locale] || en;
  return (key: string, params?: Record<string, string | number>): string => {
    let val = dict[key];
    if (!val) {
      val = en[key] || key;
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(`{${k}}`, String(v));
      }
    }
    return val;
  };
}
