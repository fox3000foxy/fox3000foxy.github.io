import { useEffect, useMemo, useState } from "react";
import { Link } from "../lib/navigation";
import { useLang } from "../hooks/useLang";
import {
	getCachedArticleMarkdown,
	prefetchArticleMarkdown,
} from "../utils/articleCache";
import { cacheBust } from "../utils/cacheBust";
import type { ArticleMeta } from "../types";
import "../styles/SearchPage.css";

export default function SearchPage() {
	const { t, lang } = useLang();
	const [articles, setArticles] = useState<ArticleMeta[]>([]);
	const [query, setQuery] = useState("");

	useEffect(() => {
		const indexUrl = `/articles/${lang}/index.json`;
		const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";

		async function load() {
			let res = await fetch(cacheBust(indexUrl));
			if (!res.ok && fallbackUrl) {
				res = await fetch(cacheBust(fallbackUrl));
			}
			if (!res.ok) {
				return;
			}

			const data: unknown = await res.json();
			if (Array.isArray(data)) {
				const normalized: ArticleMeta[] = data.map(
					(item: string | ArticleMeta) =>
						typeof item === "string" ? { slug: item } : item
				);
				setArticles(normalized);
				prefetchArticleMarkdown(
					normalized.map((a) => a.slug).filter(Boolean),
					lang
				);
			}
		}
		void load();
	}, [lang]);

	const q = query.toLowerCase().trim();

	const results = useMemo(() => {
		if (!q) {
			return [];
		}
		return articles.filter((a) => {
			const text =
				getCachedArticleMarkdown(a.slug, lang) ??
				getCachedArticleMarkdown(a.slug, "en");
			return (
				a.title?.toLowerCase().includes(q) ||
				a.description?.toLowerCase().includes(q) ||
				a.tags?.some((t) => t.toLowerCase().includes(q)) ||
				(text?.toLowerCase().includes(q) ?? false)
			);
		});
	}, [q, articles, lang]);

	return (
		<article className="search-page">
			<h1>{t("search.title")}</h1>

			<div className="search-bar search-page-bar">
				<input
					type="search"
					placeholder={t("search.placeholder")}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{query && (
					<button
						type="button"
						className="search-clear"
						onClick={() => setQuery("")}
						aria-label={t("search.clear")}
					>
						×
					</button>
				)}
			</div>

			<p className="search-hint">{t("search.hint")}</p>

			{query && (
				<p className="search-summary">
					{t("search.results", { n: results.length, query })}
				</p>
			)}

			{query && results.length === 0 && (
				<p className="search-no-results">{t("search.no.results", { query })}</p>
			)}

			{results.length > 0 && (
				<div className="search-results">
					{results.map((article) => (
						<Link
							key={article.slug}
							to={`/blog/${article.slug}`}
							className="search-result-card"
						>
							<h3>{article.title || article.slug}</h3>
							{article.description && (
								<p className="search-result-desc">{article.description}</p>
							)}
							<div className="search-result-meta">
								{article.date && (
									<span className="search-result-date">{article.date}</span>
								)}
								{article.tags && article.tags.length > 0 && (
									<div className="search-result-tags">
										{article.tags.map((tag) => (
											<span key={tag} className="tag-badge">
												{tag}
											</span>
										))}
									</div>
								)}
							</div>
						</Link>
					))}
				</div>
			)}
		</article>
	);
}
