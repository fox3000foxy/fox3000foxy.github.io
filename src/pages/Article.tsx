import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import ArticleSchema from "../components/ArticleSchema";
import AudioPlayer from "../components/AudioPlayer";
import AuthorBio from "../components/AuthorBio";
import BookmarkButton from "../components/BookmarkButton";
import GiscusComments from "../components/GiscusComments";
import MarkdownContent from "../components/MarkdownContent";
import ReadingProgress from "../components/ReadingProgress";
import SeriesNav from "../components/SeriesNav";
import ShareButtons from "../components/ShareButtons";
import SuggestedArticles from "../components/SuggestedArticles";
import TableOfContents from "../components/TableOfContents";
import { useLang } from "../hooks/useLang";
import { useReadingMode } from "../hooks/useReadingMode";
import { useReadStatus } from "../hooks/useReadStatus";
import type { ArticleMeta } from "../types";
import {
	fetchArticleMarkdown,
	getCachedArticleMarkdown,
} from "../utils/articleCache";
import { parseFrontMatter } from "../utils/frontmatter";
import { isNew } from "../utils/isNew";
import { verifyArticle } from "../utils/verify";
import NotFound from "./NotFound";

function processArticleContent(text: string): string {
	return text.replaceAll("assets/", "/articles/assets/");
}

function estimateReadingTime(text: string): number {
	// Remove code blocks (backtick-fenced code)
	const noCode = text.replace(/```[\s\S]*?```/g, "");
	// Remove inline code
	const clean = noCode.replace(/`[^`]+`/g, "");
	const words = clean.trim().split(/\s+/).length;
	// Technical text is read slower; use 150 wpm
	return Math.max(1, Math.ceil(words / 150));
}

export default function Article() {
	const { slug } = useParams<{ slug: string }>();
	const { t, lang } = useLang();
	const location = useLocation();
	const readingMode = useReadingMode();
	const { markAsRead } = useReadStatus();
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [meta, setMeta] = useState<ArticleMeta | null>(null);
	const [allArticles, setAllArticles] = useState<ArticleMeta[]>([]);
	const [verified, setVerified] = useState(false);

	useEffect(() => {
		if (!slug) {
			return;
		}
		markAsRead(slug);

		function process(text: string): {
			clean: string;
			frontMeta: Partial<ArticleMeta>;
		} {
			const { meta, content } = parseFrontMatter(text);
			return { clean: processArticleContent(content), frontMeta: meta };
		}

		const cached = getCachedArticleMarkdown(slug, lang);
		if (cached === null) {
			Promise.resolve(fetchArticleMarkdown(slug, lang))
				.then((text) => {
					if (!text) {
						setError(true);
						return;
					}
					const { clean, frontMeta } = process(text);
					setContent(clean);
					setMeta((prev) =>
						prev
							? { ...prev, ...frontMeta }
							: ({ slug: slug!, ...frontMeta } as ArticleMeta)
					);
				})
				.catch(() => setError(true));
		} else {
			const { clean, frontMeta } = process(cached);
			setContent(clean);
			setTimeout(() => {
				setMeta((prev) =>
					prev
						? { ...prev, ...frontMeta }
						: ({ slug: slug!, ...frontMeta } as ArticleMeta)
				);
			}, 0);
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
				setMeta((prev) => {
					const fromIndex = normalized.find((a) => a.slug === slug) || null;
					return prev ? { ...fromIndex, ...prev } : fromIndex;
				});
			}
		}
		void loadIndex();
	}, [slug, lang, markAsRead]);

	// Scroll to anchor hash when content is loaded
	useEffect(() => {
		if (!(content && location.hash)) {
			return;
		}
		const id = decodeURIComponent(location.hash.slice(1));
		let attempts = 0;
		const tryScroll = () => {
			const el = document.getElementById(id);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
			} else if (attempts < 10) {
				attempts++;
				setTimeout(tryScroll, 200);
			}
		};
		setTimeout(tryScroll, 100);
	}, [content, location.hash]);

	// Verify article signature
	useEffect(() => {
		if (!(slug && meta?.author_sig && content)) {
			return;
		}
		const author = meta.authors?.[0] || "";
		const date = meta.date || "";
		verifyArticle(slug, author, date, content, meta.author_sig).then(
			setVerified,
		);
	}, [slug, meta, content]);

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
				{isNew(meta?.date) && <span className="new-badge">NEW</span>}
				{meta?.aiGenerated && (
					<span className="ai-badge">{t("article.ai")}</span>
				)}
				<p className="article-date">
					{meta?.date && <time dateTime={meta.date}>{meta.date}</time>}
					{meta?.lastmod && meta.lastmod !== meta.date && (
						<>
							<span className="article-sep">·</span>
							<span className="article-updated">
								{t("article.updated", { date: meta.lastmod })}
							</span>
						</>
					)}
					{meta?.date && <span className="article-sep">·</span>}
					<span>
						{t("article.minRead", { n: estimateReadingTime(content) })}
					</span>
				</p>
				<AuthorBio authors={meta?.authors} verified={verified} />
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
				<AudioPlayer slug={slug!} lang={lang} />
				<div className="share-buttons">
					<ShareButtons
						url={window.location.href}
						title={meta?.title ?? slug ?? ""}
					/>
					<BookmarkButton slug={slug!} />
					<button
						type="button"
						className={`reading-mode-btn${readingMode.enabled ? " active" : ""}`}
						onClick={readingMode.toggle}
						aria-label="Toggle reading mode"
						title="Reading mode"
					>
						{readingMode.enabled ? "Aa" : "Aa"}
					</button>
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
