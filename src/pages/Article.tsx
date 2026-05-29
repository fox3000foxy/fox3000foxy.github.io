import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	fetchArticleMarkdown,
	getCachedArticleMarkdown,
} from "../utils/articleCache";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import SuggestedArticles from "../components/SuggestedArticles";
import TableOfContents from "../components/TableOfContents";
import ArticleSchema from "../components/ArticleSchema";
import AuthorBio from "../components/AuthorBio";
import SeriesNav from "../components/SeriesNav";
import GiscusComments from "../components/GiscusComments";
import ReadingProgress from "../components/ReadingProgress";
import ShareButtons from "../components/ShareButtons";
import BookmarkButton from "../components/BookmarkButton";
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
		if (!slug) {
			return;
		}

		const cached = getCachedArticleMarkdown(slug, lang);
		if (cached === null) {
			Promise.resolve(fetchArticleMarkdown(slug, lang))
				.then((text) => {
					if (!text) {
						setError(true);
						return;
					}
					setContent(processArticleContent(text));
				})
				.catch(() => setError(true));
		} else {
			setContent(processArticleContent(cached));
		}

		const indexUrl = `/articles/${lang}/index.json`;
		const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";

		async function loadIndex() {
			let res = await fetch(indexUrl);
			if (!res.ok && fallbackUrl) {
				res = await fetch(fallbackUrl);
			}
			if (!res.ok) {
				return;
			}

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
		void loadIndex();
	}, [slug, lang]);

	const sorted = useMemo(() => {
		return [...allArticles].sort(
			(a, b) =>
				new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
		);
	}, [allArticles]);

	const idx = sorted.findIndex((a) => a.slug === slug);
	const prevArticle = idx < sorted.length - 1 ? sorted[idx + 1] : null;
	const nextArticle = idx > 0 ? sorted[idx - 1] : null;

	if (error) {
		return <NotFound message={t("notFound.article", { slug: slug || "" })} />;
	}

	if (content === null) {
		return <p>{t("article.error")}</p>;
	}

	return (
		<>
			{meta && slug && <ArticleSchema meta={meta} slug={slug} />}
			<article>
				<ReadingProgress />
				{meta?.aiGenerated && (
					<span className="ai-badge">{t("article.ai")}</span>
				)}
				<p className="article-date">
					{meta?.date && <time dateTime={meta.date}>{meta.date}</time>}
					{meta?.date && <span className="article-sep">·</span>}
					<span>
						{t("article.minRead", { n: estimateReadingTime(content) })}
					</span>
				</p>
				<AuthorBio authors={meta?.authors} />
				{meta?.description && (
					<p className="article-description">{meta.description}</p>
				)}
				{meta?.tags && meta.tags.length > 0 && (
					<div className="article-tags">
						{meta.tags.map((tag) => (
							<Link key={tag} to={`/tags/${tag}`} className="tag-badge">
								{tag}
							</Link>
						))}
					</div>
				)}
				<div className="share-buttons">
					<ShareButtons
						url={window.location.href}
						title={meta?.title ?? slug ?? ""}
					/>
					<BookmarkButton slug={slug!} />
				</div>
				<div className="article-layout">
					<TableOfContents content={content} />
					<div className="article-content">
						<MarkdownContent content={content} />
						{meta?.series && (
							<SeriesNav
								series={meta.series}
								currentSlug={slug!}
								allArticles={allArticles}
							/>
						)}
						{meta?.tags && meta.tags.length > 0 && (
							<SuggestedArticles
								currentSlug={slug!}
								currentTags={meta.tags}
								allArticles={allArticles}
								lang={lang}
							/>
						)}
						{(prevArticle || nextArticle) && (
							<nav className="article-nav">
								{prevArticle && (
									<Link
										to={`/blog/${prevArticle.slug}`}
										className="article-nav-link prev"
									>
										<span className="article-nav-label">
											{t("article.prev")}
										</span>
										<span className="article-nav-title">
											{prevArticle.title}
										</span>
									</Link>
								)}
								{nextArticle && (
									<Link
										to={`/blog/${nextArticle.slug}`}
										className="article-nav-link next"
									>
										<span className="article-nav-label">
											{t("article.next")}
										</span>
										<span className="article-nav-title">
											{nextArticle.title}
										</span>
									</Link>
								)}
							</nav>
						)}
						<GiscusComments lang={lang} />
					</div>
				</div>
			</article>
		</>
	);
}
