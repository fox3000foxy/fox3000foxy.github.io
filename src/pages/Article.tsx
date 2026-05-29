import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
	fetchArticleMarkdown,
	getCachedArticleMarkdown,
} from "../utils/articleCache";
import type { ArticleMeta } from "../types";
import MarkdownContent from "../components/MarkdownContent";
import TableOfContents from "../components/TableOfContents";
import NotFound from "./NotFound";

function processArticleContent(text: string): string {
	return text.replaceAll("assets/", "/articles/assets/");
}

export default function Article() {
	const { slug } = useParams<{ slug: string }>();
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [meta, setMeta] = useState<ArticleMeta | null>(null);

	useEffect(() => {
		if (!slug) { return; }

		const cached = getCachedArticleMarkdown(slug);
		if (cached !== null) {
			setContent(processArticleContent(cached));
		} else {
			Promise.resolve(fetchArticleMarkdown(slug))
				.then((text) => {
					if (!text) {
						setError(true);
						return;
					}
					setContent(processArticleContent(text));
				})
				.catch(() => setError(true));
		}

		fetch("/articles/index.json")
			.then((res) => (res.ok ? res.json() : []))
			.then((data) => {
				if (Array.isArray(data)) {
					// biome-ignore lint/suspicious/noExplicitAny: need to handle legacy string format
					const normalized: ArticleMeta[] = data.map((item: any) =>
						typeof item === "string" ? { slug: item } : item
					);
					setMeta(normalized.find((a) => a.slug === slug) || null);
				}
			})
			.catch(() => {});
	}, [slug]);

	if (error) {
		return <NotFound message={`Article "${slug}" not found`} />;
	}

	if (content === null) {
		return <p>Loading…</p>;
	}

	return (
		<article>
			{meta?.aiGenerated && (
				<span className="ai-badge">✨ AI Generated Article</span>
			)}
			{meta?.date && <p className="article-date">{meta.date}</p>}
			{meta?.description && (
				<p className="article-description">{meta.description}</p>
			)}
			{meta?.tags && meta.tags.length > 0 && (
				<div className="article-tags">
					{meta.tags.map((tag) => (
						<span key={tag} className="tag-badge">{tag}</span>
					))}
				</div>
			)}
			<TableOfContents content={content} />
			<MarkdownContent content={content} />
		</article>
	);
}
