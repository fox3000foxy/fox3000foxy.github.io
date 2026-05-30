import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/BlogList.css";
import {
	getCachedArticleMarkdown,
	prefetchArticleMarkdown,
	prefetchMarkdownEntries,
} from "../utils/articleCache";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";
import { useReadStatus } from "../hooks/useReadStatus";
import BookmarkButton from "../components/BookmarkButton";
import { getAuthors } from "../utils/authors";

const PAGE_SIZE = 15;

function isNew(dateStr?: string): boolean {
	if (!dateStr) {
		return false;
	}
	const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	return new Date(`${dateStr}T12:00:00Z`).getTime() > sevenDaysAgo;
}

export default function BlogList() {
	const { t, lang } = useLang();
	const navigate = useNavigate();
	const { markAsRead, isRead } = useReadStatus();
	const [articles, setArticles] = useState<ArticleMeta[]>([]);
	const [activeTag, setActiveTag] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(0);

	useEffect(() => {
		const indexUrl = `/articles/${lang}/index.json`;
		const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";

		async function load() {
			let res = await fetch(indexUrl);
			if (!res.ok && fallbackUrl) {
				res = await fetch(fallbackUrl);
			}
			if (!res.ok) {
				setArticles([]);
				return;
			}

			const data: unknown = await res.json();
			if (Array.isArray(data)) {
				// biome-ignore lint/suspicious/noExplicitAny: legacy string format
				const normalized: ArticleMeta[] = (data as any[]).map((item) =>
					typeof item === "string" ? { slug: item } : item
				);
				normalized.sort(
					(a, b) =>
						new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
				);
				setArticles(normalized);

				const slugs = normalized.map((item) => item.slug).filter(Boolean);
				prefetchArticleMarkdown(slugs, lang);
				if (lang !== "en") {
					prefetchArticleMarkdown(slugs, "en");
				}

				prefetchMarkdownEntries([
					{ key: "home", url: "/home.md" },
					{ key: "portfolio", url: "/portfolio.md" },
				]);
			} else {
				setArticles([]);
			}
		}
		void load();
	}, [lang]);

	const query = searchQuery.toLowerCase().trim();

	const allTags = useMemo(
		() => [...new Set(articles.flatMap((a) => a.tags ?? []))].sort(),
		[articles]
	);

	const filtered = articles.filter((a) => {
		if (activeTag && !a.tags?.includes(activeTag)) {
			return false;
		}
		if (!query) {
			return true;
		}
		const text =
			getCachedArticleMarkdown(a.slug, lang) ??
			getCachedArticleMarkdown(a.slug, "en");
		return (
			a.title?.toLowerCase().includes(query) ||
			a.description?.toLowerCase().includes(query) ||
			a.tags?.some((t) => t.toLowerCase().includes(query)) ||
			(text?.toLowerCase().includes(query) ?? false)
		);
	});

	const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
	const safePage = Math.min(page, Math.max(0, pageCount - 1));
	const paged = filtered.slice(
		safePage * PAGE_SIZE,
		(safePage + 1) * PAGE_SIZE
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
	useEffect(() => {
		setPage(0);
	}, [activeTag, searchQuery]);

	function randomArticle() {
		if (filtered.length === 0) {
			return;
		}
		const slug = filtered[Math.floor(Math.random() * filtered.length)].slug;
		void navigate(`/blog/${slug}`);
	}

	return (
		<div className="blog-list">
			<div className="blog-list-header">
				<h2>{t("blog.title")}</h2>
				{filtered.length > 0 && (
					<button type="button" className="random-btn" onClick={randomArticle}>
						🎲 {t("blog.random")}
					</button>
				)}
			</div>

			<div className="search-bar">
				<input
					type="search"
					placeholder={t("blog.search")}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
				{searchQuery && (
					<button
						type="button"
						className="search-clear"
						onClick={() => setSearchQuery("")}
						aria-label={t("search.clear")}
					>
						×
					</button>
				)}
			</div>

			{allTags.length > 0 && (
				<div className="tag-filter">
					<button
						type="button"
						className={`tag-btn${activeTag === null ? " active" : ""}`}
						onClick={() => setActiveTag(null)}
					>
						{t("blog.filter.all")}
					</button>
					{allTags.map((tag) => (
						<button
							type="button"
							key={tag}
							className={`tag-btn${activeTag === tag ? " active" : ""}`}
							onClick={() => setActiveTag(tag)}
						>
							{tag}
						</button>
					))}
				</div>
			)}

			{filtered.length > 0 ? (
				<>
					<div className="blog-grid">
						{paged.map(
							({
								slug,
								title,
								description,
								date,
								readingTime,
								aiGenerated,
								tags,
								authors,
							}) => (
								<Link
									to={`/blog/${slug}`}
									key={slug}
									className={`blog-card${isRead(slug) ? " read" : ""}`}
									onClick={() => markAsRead(slug)}
								>
									<div className="blog-card-body">
										<h3 className="blog-card-title">
											{title ?? slug.replace(/-/g, " ")}
											{isNew(date) && <span className="new-badge">NEW</span>}
										</h3>
										{aiGenerated && (
											<span className="ai-badge">{t("article.ai")}</span>
										)}
										{description && (
											<p className="blog-card-desc">{description}</p>
										)}
										{tags && tags.length > 0 && (
											<div className="blog-card-tags">
												{tags.map((tag) => (
													<span key={tag} className="tag-badge">
														{tag}
													</span>
												))}
											</div>
										)}
									</div>
									<div className="blog-card-footer">
										<div className="blog-card-meta">
											{date && (
												<time dateTime={date}>
													{new Date(`${date}T00:00:00`).toLocaleDateString(
														lang,
														{
															year: "numeric",
															month: "long",
															day: "numeric",
														}
													)}
												</time>
											)}
											{readingTime && (
												<span className="blog-card-reading-time">
													{t("article.minRead", { n: readingTime })}
												</span>
											)}
										</div>
										<div className="blog-card-authors">
											{getAuthors(authors).map((a) => (
												<img
													key={a.id}
													className="blog-card-author-avatar"
													src={a.avatar ?? `https://github.com/${a.id}.png`}
													alt={a.name}
													title={a.name}
												/>
											))}
										</div>
										<BookmarkButton slug={slug} />
									</div>
								</Link>
							)
						)}
					</div>
					{pageCount > 1 && (
						<div className="pagination">
							<button
								type="button"
								disabled={page === 0}
								onClick={() => setPage(page - 1)}
							>
								←
							</button>
							<span>
								{page + 1} / {pageCount}
							</span>
							<button
								type="button"
								disabled={page >= pageCount - 1}
								onClick={() => setPage(page + 1)}
							>
								→
							</button>
						</div>
					)}
				</>
			) : (
				<p>
					{searchQuery
						? t("blog.no.match", { query: searchQuery })
						: activeTag
							? t("blog.no.tag", { tag: activeTag })
							: t("blog.no.articles")}
				</p>
			)}
		</div>
	);
}
