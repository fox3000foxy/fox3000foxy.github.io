import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "../styles/Home.css";
import { fetchMarkdown, getCachedArticleMarkdown } from "../utils/articleCache";

// reuse the same schema as Home so that authors can add classes and styles
const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		"*": [...(defaultSchema.attributes?.["*"] || []), "class", "style"],
	},
};

export default function Portfolio() {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		const cached = getCachedArticleMarkdown("portfolio");
		if (cached !== null) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setContent(cached);
			setError(false);
			return;
		}

		Promise.resolve(fetchMarkdown("portfolio", "/portfolio.md"))
			.then((text) => {
				if (text === null) {
					setError(true);
					return;
				}
				setContent(text);
			})
			.catch(() => setError(true));
	}, []);

	if (error) {
		return <p>Unable to load portfolio page.</p>;
	}
	if (content === null) {
		return <p>Loading…</p>;
	}

	const components = {
		a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
			const { href, children, ...rest } = props;
			if (!href) { return <a {...rest}>{children}</a>; }
			const isExternal = /^https?:\/\//.test(href);
			if (isExternal) {
				return (
					<a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
						{children}
					</a>
				);
			}
			return (
				<a href={href} {...rest}>
					{children}
				</a>
			);
		},
	};

	return (
		<article className="home">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[
					rehypeRaw,
					[rehypeSanitize, sanitizeSchema],
					rehypeHighlight,
				]}
				components={components}
			>
				{content}
			</ReactMarkdown>
		</article>
	);
}
