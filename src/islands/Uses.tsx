import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

export default function Uses() {
	const { t, lang } = useLang();
	const url = lang === "en" ? "/uses.md" : `/uses.${lang}.md`;
	const fallbackUrl = lang === "en" ? undefined : "/uses.md";
	const { content, error } = useMarkdown(url, `uses:${lang}`, fallbackUrl);

	if (error) {
		return <p>{t("uses.error")}</p>;
	}

	if (content === null) {
		return <p>{t("uses.loading")}</p>;
	}

	return (
		<article>
			<MarkdownContent content={content} />
		</article>
	);
}
