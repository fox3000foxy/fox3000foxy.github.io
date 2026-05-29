import "../styles/Home.css";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

export default function Home() {
	const { content, error } = useMarkdown("/home.md", "home");

	if (error) {
		return <p>Unable to load home page.</p>;
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
