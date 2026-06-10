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
	| "es"
	| "pt"
	| "id"
	| "hi"
	| "ar";

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
	"pt",
	"id",
	"hi",
	"ar",
];

export type TranslationMap = Record<string, string>;
