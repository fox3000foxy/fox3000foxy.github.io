export type Lang =
	| "en"
	| "fr"
	| "zh"
	| "ja"
	| "ko"
	| "tr"
	| "it"
	| "de"
	| "ru"
	| "es";

export const ALL_LANGS: Lang[] = [
	"en",
	"fr",
	"zh",
	"ja",
	"ko",
	"tr",
	"it",
	"de",
	"ru",
	"es",
];

export type TranslationMap = Record<string, string>;
