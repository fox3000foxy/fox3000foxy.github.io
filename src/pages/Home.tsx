import "../styles/Home.css";
import { useLang } from "../hooks/useLang";
import LazyVisible from "../components/LazyVisible";
import MarkdownContent from "../components/MarkdownContent";
import GitHubActivity from "../components/GitHubActivity";
import NewsletterSignup from "../components/NewsletterSignup";
import RssSubscribe from "../components/RssSubscribe";
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
		return (
			<article className="home home-skeleton">
				<div className="skeleton-title" />
				<div className="skeleton-line" />
				<div className="skeleton-line" />
				<div className="skeleton-line skeleton-line--short" />
			</article>
		);
	}

	return (
		<article className="home">
			<MarkdownContent content={content} />
			<RssSubscribe />
			<LazyVisible>
				<GitHubActivity />
			</LazyVisible>
			<LazyVisible>
				<NewsletterSignup />
			</LazyVisible>
		</article>
	);
}
