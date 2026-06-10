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
	| "ar"
	| "vi"
	| "th";

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
	"vi",
	"th",
];

export type TranslationMap = Record<string, string>;
