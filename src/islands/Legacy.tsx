import "../styles/Home.css";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

export default function Legacy() {
	const { t } = useLang();
	const { content, error } = useMarkdown("/legacy.md", "legacy");

	if (error) {
		return <p>{t("portfolio.error")}</p>;
	}

	if (content === null) {
		return <p>{t("portfolio.loading")}</p>;
	}

	return (
		<article className="home">
			<MarkdownContent content={content} />
		</article>
	);
}
