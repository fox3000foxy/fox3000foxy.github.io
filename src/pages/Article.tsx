import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
	fetchArticleMarkdown,
	getCachedArticleMarkdown,
} from "../utils/articleCache";
import NotFound from "./NotFound";

// extend the default schema to permit class and style on all elements
// this allows authors to write inline styles in markdown HTML
const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		"*": [...(defaultSchema.attributes?.["*"] || []), "class", "style"],
	},
};

interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
	date?: string;
	aiGenerated?: boolean;
}

export default function Article() {
	const { slug } = useParams<{ slug: string }>();
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [meta, setMeta] = useState<ArticleMeta | null>(null);

	useEffect(() => {
		if (!slug) { return; }

		const fromCache = getCachedArticleMarkdown(slug);
		if (fromCache === null) {
			const fetchPromise = fetchArticleMarkdown(slug);
			if (typeof fetchPromise === "string") {
				const processed = fetchPromise.replaceAll("assets/", "/articles/assets/");
				setContent(processed);
				setError(false);
			} else if (fetchPromise instanceof Promise) {
				fetchPromise
					.then((text) => {
						if (!text) {
							setError(true);
							return;
						}
						const processed = text.replaceAll("assets/", "/articles/assets/");
						setContent(processed);
						setError(false);
					})
					.catch(() => setError(true));
			}
		} else {
			const processed = fromCache.replaceAll("assets/", "/articles/assets/");
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setContent(processed);
			setError(false);
		}

		// fetch metadata from index.json (if available)
		fetch("/articles/index.json")
			.then((res) => (res.ok ? res.json() : []))
			.then((data) => {
				if (Array.isArray(data)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					// biome-ignore lint/suspicious/noExplicitAny: need to handle legacy string format
					const normalized: ArticleMeta[] = data.map((item: any) =>
						typeof item === "string" ? { slug: item } : item
					);
					const found = normalized.find((a) => a.slug === slug);
					setMeta(found || null);
				}
			})
			.catch(() => {
				/* no-op */
			});
	}, [slug]);

	if (error) {
		return <NotFound message={`Article "${slug}" not found`} />;
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
		<article>
			{/* display metadata if available */}
			{meta?.aiGenerated && (
				<span className="ai-badge">✨ AI Generated Article</span>
			)}
			{meta?.date && <p className="article-date">{meta.date}</p>}
			{meta?.description && (
				<p className="article-description">{meta.description}</p>
			)}
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
