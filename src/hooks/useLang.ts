import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import type { Lang } from "../i18n/types";
import { ALL_LANGS } from "../i18n/types";
import { translations } from "../i18n";

const LANG_KEY = "fox-blog-lang";

function detectLang(): Lang {
	if (typeof localStorage !== "undefined") {
		const stored = localStorage.getItem(LANG_KEY) as Lang | null;
		if (stored && ALL_LANGS.includes(stored)) {
			return stored;
		}
	}
	if (typeof navigator !== "undefined") {
		const prefs = navigator.languages ?? [navigator.language];
		for (const pref of prefs) {
			const code = pref.split("-")[0] as Lang;
			if (ALL_LANGS.includes(code)) {
				return code;
			}
		}
	}
	return "en";
}

interface LangCtx {
	lang: Lang;
	setLang: (l: Lang) => void;
	t: (key: string, params?: Record<string, string | number>) => string;
}

const FALLBACK_T = (key: string, _params?: Record<string, string | number>) =>
	key;

export const LangContext = createContext<LangCtx>({
	lang: "en",
	setLang: () => {},
	t: FALLBACK_T,
});

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
