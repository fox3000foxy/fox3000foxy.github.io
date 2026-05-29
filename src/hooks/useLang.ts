import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Lang } from "../i18n/translations";
import { translations } from "../i18n/translations";

const LANG_KEY = "fox-blog-lang";

function detectLang(): Lang {
	if (typeof localStorage !== "undefined") {
		const stored = localStorage.getItem(LANG_KEY);
		if (stored === "en" || stored === "fr") { return stored; }
	}
	if (typeof navigator !== "undefined") {
		const prefs = navigator.languages ?? [navigator.language];
		for (const pref of prefs) {
			if (pref.startsWith("fr")) { return "fr"; }
		}
	}
	return "en";
}

interface LangCtx {
	lang: Lang;
	setLang: (l: Lang) => void;
	t: (key: string, params?: Record<string, string | number>) => string;
}

export const LangContext = createContext<LangCtx>(null!);

export function useLang() {
	return useContext(LangContext);
}

export function useLangState(): LangCtx {
	const [lang, setLangState] = useState<Lang>(detectLang);

	useEffect(() => {
		localStorage.setItem(LANG_KEY, lang);
		document.documentElement.lang = lang;
	}, [lang]);

	const setLang = useCallback((l: Lang) => setLangState(l), []);

	const t = useCallback(
		(key: string, params?: Record<string, string | number>): string => {
			let msg = translations[lang]?.[key] ?? translations.en[key] ?? key;
			if (params) {
				for (const [k, v] of Object.entries(params)) {
					msg = msg.replace(`{${k}}`, String(v));
				}
			}
			return msg;
		},
		[lang]
	);

	return { lang, setLang, t };
}
