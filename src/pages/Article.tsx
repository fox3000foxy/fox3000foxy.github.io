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

function estimateReadingTime(text: string): number {
	const words = text.trim().split(/\s+/).length;
	return Math.max(1, Math.ceil(words / 200));
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
			<p className="article-date">
				{meta?.date && <time dateTime={meta.date}>{meta.date}</time>}
				{meta?.date && <span className="article-sep">·</span>}
				<span>{estimateReadingTime(content)} min read</span>
			</p>
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
