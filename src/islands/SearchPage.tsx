import { useMemo, useState } from "react";
import { Link } from "../lib/navigation";
import { useLang } from "../hooks/useLang";
import type { ArticleMeta } from "../types";
import "../styles/SearchPage.css";

interface SearchPageProps {
	allIndexes?: Record<string, unknown[]>;
}

export default function SearchPage({ allIndexes }: SearchPageProps) {
	const { t, lang } = useLang();
	const [query, setQuery] = useState("");

	const articles = useMemo(() => {
		const data = allIndexes?.[lang] ?? allIndexes?.en ?? [];
		return (data as { slug?: string }[]).map((item) =>
			typeof item === "string" ? { slug: item } : item
		) as ArticleMeta[];
	}, [allIndexes, lang]);

	const q = query.trim().toLowerCase();

	const results = useMemo(() => {
		if (!q) {
			return [];
		}
		return articles
			.filter((a) => {
				const title = (a.title ?? "").toLowerCase();
				const desc = (a.description ?? "").toLowerCase();
				const tags = (a.tags ?? []).join(" ").toLowerCase();
				return (
					title.includes(q) ||
					desc.includes(q) ||
					tags.includes(q) ||
					a.slug?.toLowerCase().includes(q)
				);
			})
			.sort((a, b) => {
				const aScore = (a.title ?? "").toLowerCase().includes(q) ? 2 : 1;
				const bScore = (b.title ?? "").toLowerCase().includes(q) ? 2 : 1;
				return bScore - aScore;
			});
	}, [articles, q]);

	return (
		<div className="search-page">
			<h2>{t("search.title")}</h2>
			<div className="search-input-wrap">
				<input
					type="search"
					className="search-input"
					placeholder={t("search.placeholder")}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{query && (
					<button
						type="button"
						className="search-clear-btn"
						onClick={() => setQuery("")}
						aria-label={t("search.clear")}
					>
						×
					</button>
				)}
			</div>

			<div className="search-results">
				{q && results.length === 0 && (
					<p className="search-no-results">
						{t("search.noResults", { query: q })}
					</p>
				)}
				{results.map((article) => (
					<Link
						key={article.slug}
						to={`/blog/${article.slug}`}
						className="search-result-card"
					>
						<h3 className="search-result-title">
							{article.title ?? article.slug}
						</h3>
						{article.description && (
							<p className="search-result-desc">{article.description}</p>
						)}
						<div className="search-result-meta">
							{article.date && <time>{article.date}</time>}
							{article.tags && article.tags.length > 0 && (
								<span className="search-result-tags">
									{article.tags.map((t) => `#${t}`).join(" ")}
								</span>
							)}
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
