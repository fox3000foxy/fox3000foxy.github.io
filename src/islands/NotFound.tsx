import { Link } from "../lib/navigation";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";

interface Props {
	message?: string;
}

export default function NotFound({ message }: Props) {
	const { t } = useLang();
	const { content } = useMarkdown("/404.md", "404");

	if (content === null) {
		return <p>{t("notFound.loading")}</p>;
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
			<p>{message || t("notFound.title")}</p>
			<p>
				<Link to="/">{t("notFound.return")}</Link>
			</p>
		</div>
	);
}
