import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "../styles/Home.css";
import { fetchMarkdown, getCachedArticleMarkdown } from "../utils/articleCache";

// extend the default schema to permit `class` and `style` on all elements
// (so markdown authors can add classes or inline styles to wrappers, tables, etc.)
const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		// allow any tag to have class or style attributes
		"*": [...(defaultSchema.attributes?.["*"] || []), "class", "style"],
	},
};

export default function Home() {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		const cached = getCachedArticleMarkdown("home");
		if (cached !== null) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setContent(cached);
			setError(false);
			return;
		}

		fetchMarkdown("home", "/home.md")
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
		return <p>Unable to load home page.</p>;
	}
	if (content === null) {
		return <p>Loading…</p>;
	}

	// custom anchor renderer: open absolute links in a new tab
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
