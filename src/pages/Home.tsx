import "../styles/Home.css";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import GitHubActivity from "../components/GitHubActivity";
import { useMarkdown } from "../hooks/useMarkdown";

export default function Home() {
	const { t, lang } = useLang();
	const url = lang === "en" ? "/home.md" : `/home.${lang}.md`;
	const fallbackUrl = lang === "en" ? undefined : "/home.md";
	const { content, error } = useMarkdown(url, `home:${lang}`, fallbackUrl);

	if (error) {
		return <p>{t("home.error")}</p>;
	}

	if (content === null) {
		return <p>{t("home.loading")}</p>;
	}

	return (
		<article className="home">
			<MarkdownContent content={content} />
			<GitHubActivity />
		</article>
	);
}
