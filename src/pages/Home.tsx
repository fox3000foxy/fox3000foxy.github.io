import "../styles/Home.css";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

export default function Home() {
	const { t } = useLang();
	const { content, error } = useMarkdown("/home.md", "home");

	if (error) {
		return <p>{t("home.error")}</p>;
	}

	if (content === null) {
		return <p>{t("home.loading")}</p>;
	}

	return (
		<article className="home">
			<MarkdownContent content={content} />
		</article>
	);
}
