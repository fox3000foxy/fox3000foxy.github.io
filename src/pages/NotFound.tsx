import { Link } from "react-router-dom";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

interface Props {
	message?: string;
}

export default function NotFound({ message }: Props) {
	const { content } = useMarkdown("/404.md", "404");

	if (content === null) {
		return <p>Loading…</p>;
	}

	if (content) {
		return (
			<article>
				<MarkdownContent content={content} />
			</article>
		);
	}

	return (
		<div>
			<h2>404</h2>
			<p>{message || "Page not found."}</p>
			<p>
				<Link to="/">Return home</Link>
			</p>
		</div>
	);
}
