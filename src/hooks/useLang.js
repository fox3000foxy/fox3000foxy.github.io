import { createContext, useCallback, useContext, useEffect, useState, } from "react";
import { ALL_LANGS } from "../i18n/types";
import { translations } from "../i18n";
const LANG_KEY = "fox-blog-lang";
function detectLang() {
    if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(LANG_KEY);
        if (stored && ALL_LANGS.includes(stored)) {
            return stored;
        }
    }
    if (typeof navigator !== "undefined") {
        const prefs = navigator.languages ?? [navigator.language];
        for (const pref of prefs) {
            const code = pref.split("-")[0];
            if (ALL_LANGS.includes(code)) {
                return code;
            }
        }
    }
    return "en";
}
export const LangContext = createContext(null);
export function useLang() {
    return useContext(LangContext);
}
export function useLangState() {
    const [lang, setLangState] = useState(detectLang);
    useEffect(() => {
        localStorage.setItem(LANG_KEY, lang);
        document.documentElement.lang = lang;
    }, [lang]);
    const setLang = useCallback((l) => setLangState(l), []);
    const t = useCallback((key, params) => {
        let msg = translations[lang]?.[key] ?? translations.en[key] ?? key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                msg = msg.replace(`{${k}}`, String(v));
            }
        }
        return msg;
    }, [lang]);
    return { lang, setLang, t };
}
