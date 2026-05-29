import "../styles/Home.css";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

export default function Portfolio() {
	const { content, error } = useMarkdown("/portfolio.md", "portfolio");

	if (error) {
		return <p>Unable to load portfolio page.</p>;
	}

	if (content === null) {
		return <p>Loading…</p>;
	}

	return (
		<article className="home">
			<MarkdownContent content={content} />
		</article>
	);
}
