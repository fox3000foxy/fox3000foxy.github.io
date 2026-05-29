import type { Lang } from "./types";
import en from "./translations/en";
import fr from "./translations/fr";
import zh from "./translations/zh";
import ja from "./translations/ja";
import ko from "./translations/ko";
import tr from "./translations/tr";
import it from "./translations/it";
import de from "./translations/de";
import ru from "./translations/ru";
import es from "./translations/es";

export const translations: Record<Lang, Record<string, string>> = {
	en,
	fr,
	zh,
	ja,
	ko,
	tr,
	it,
	de,
	ru,
	es,
};
