import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
	fetchArticleMarkdown,
	getCachedArticleMarkdown,
} from "../utils/articleCache";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import SuggestedArticles from "../components/SuggestedArticles";
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
	const { t, lang } = useLang();
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [meta, setMeta] = useState<ArticleMeta | null>(null);
	const [allArticles, setAllArticles] = useState<ArticleMeta[]>([]);

	useEffect(() => {
		if (!slug) { return; }

		const cached = getCachedArticleMarkdown(slug, lang);
		if (cached !== null) {
			setContent(processArticleContent(cached));
		} else {
			Promise.resolve(fetchArticleMarkdown(slug, lang))
				.then((text) => {
					if (!text) {
						setError(true);
						return;
					}
					setContent(processArticleContent(text));
				})
				.catch(() => setError(true));
		}

		const indexUrl = `/articles/${lang}/index.json`;
		const fallbackUrl = lang !== "en" ? "/articles/en/index.json" : null;

		async function loadIndex() {
			let res = await fetch(indexUrl);
			if (!res.ok && fallbackUrl) { res = await fetch(fallbackUrl); }
			if (!res.ok) return;

			const data: unknown = await res.json();
			if (Array.isArray(data)) {
				// biome-ignore lint/suspicious/noExplicitAny: need to handle legacy string format
				const normalized: ArticleMeta[] = data.map((item: any) =>
					typeof item === "string" ? { slug: item } : item
				);
				setAllArticles(normalized);
				setMeta(normalized.find((a) => a.slug === slug) || null);
			}
		}
		loadIndex();
	}, [slug, lang]);

	if (error) {
		return <NotFound message={t("notFound.article", { slug: slug || "" })} />;
	}

	if (content === null) {
		return <p>{t("article.error")}</p>;
	}

	return (
		<article>
			{meta?.aiGenerated && (
				<span className="ai-badge">{t("article.ai")}</span>
			)}
			<p className="article-date">
				{meta?.date && <time dateTime={meta.date}>{meta.date}</time>}
				{meta?.date && <span className="article-sep">·</span>}
				<span>{t("article.minRead", { n: estimateReadingTime(content) })}</span>
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
			<div className="article-layout">
				<TableOfContents content={content} />
				<div className="article-content">
					<MarkdownContent content={content} />
					{meta?.tags && meta.tags.length > 0 && (
						<SuggestedArticles
							currentSlug={slug!}
							currentTags={meta.tags}
							allArticles={allArticles}
						/>
					)}
				</div>
			</div>
		</article>
	);
}
