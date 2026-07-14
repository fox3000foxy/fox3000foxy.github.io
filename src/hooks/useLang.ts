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

function translate(
	lang: Lang,
	key: string,
	params?: Record<string, string | number>
): string {
	let msg = translations[lang]?.[key] ?? translations.en[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			msg = msg.replace(`{${k}}`, String(v));
		}
	}
	return msg;
}

const FALLBACK_CTX: LangCtx = {
	lang: "en",
	setLang: () => {},
	t: (key, params) => translate("en", key, params),
};

export const LangContext = createContext<LangCtx>(FALLBACK_CTX);

export function useLang(): LangCtx {
	const ctx = useContext(LangContext);
	if (ctx === FALLBACK_CTX) {
		const lang = detectLang();
		return {
			lang,
			setLang: () => {},
			t: (key, params) => translate(lang, key, params),
		};
	}
	return ctx;
}

export function useLangState(): LangCtx {
	const [lang, setLangState] = useState<Lang>(detectLang);

	useEffect(() => {
		localStorage.setItem(LANG_KEY, lang);
		document.documentElement.lang = lang;
	}, [lang]);

	const setLang = useCallback((l: Lang) => setLangState(l), []);

	const t = useCallback(
		(key: string, params?: Record<string, string | number>): string =>
			translate(lang, key, params),
		[lang]
	);

	return { lang, setLang, t };
}
