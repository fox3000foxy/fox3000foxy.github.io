import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/BlogList.css";
import {
	prefetchArticleMarkdown,
	prefetchMarkdownEntries,
} from "../utils/articleCache";
import type { ArticleMeta } from "../types";

export default function BlogList() {
	const [articles, setArticles] = useState<ArticleMeta[]>([]);
	const [activeTag, setActiveTag] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		fetch("/articles/index.json")
			.then((res) => (res.ok ? res.json() : []))
			.then((data) => {
				if (Array.isArray(data)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const normalized: ArticleMeta[] = (data as any[]).map((item) =>
						typeof item === "string" ? { slug: item } : item
					);
					setArticles(normalized);

					const slugs = normalized.map((item) => item.slug).filter(Boolean);
					prefetchArticleMarkdown(slugs);

					prefetchMarkdownEntries([
						{ key: "home", url: "/home.md" },
						{ key: "portfolio", url: "/portfolio.md" },
					]);
				} else {
					setArticles([]);
				}
			})
			.catch(() => setArticles([]));
	}, []);

	const query = searchQuery.toLowerCase().trim();

	const allTags = useMemo(
		() => [...new Set(articles.flatMap((a) => a.tags ?? []))].sort(),
		[articles]
	);

	const filtered = articles.filter((a) => {
		if (activeTag && !a.tags?.includes(activeTag)) { return false; }
		if (!query) { return true; }
		return (
			a.title?.toLowerCase().includes(query) ||
			a.description?.toLowerCase().includes(query) ||
			a.tags?.some((t) => t.toLowerCase().includes(query))
		);
	});

	return (
		<div className="blog-list">
			<h2>Blog Posts</h2>

			<div className="search-bar">
				<input
					type="search"
					placeholder="Search articles…"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
				{searchQuery && (
					<button
						type="button"
						className="search-clear"
						onClick={() => setSearchQuery("")}
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
						All
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
				<div className="blog-grid">
					{filtered.map(
						({ slug, title, description, date, aiGenerated, tags }) => (
							<Link
								to={`/blog/${slug}`}
								key={slug}
								className="blog-card"
							>
								<div className="blog-card-body">
									<h3 className="blog-card-title">
										{title ?? slug.replace(/-/g, " ")}
									</h3>
									{aiGenerated && (
										<span className="ai-badge">✨ AI Generated Article</span>
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
								{date && (
									<div className="blog-card-footer">
										<time dateTime={date}>
											{new Date(`${date}T00:00:00`).toLocaleDateString(
												"fr-FR",
												{
													year: "numeric",
													month: "long",
													day: "numeric",
												}
											)}
										</time>
									</div>
								)}
							</Link>
						)
					)}
				</div>
			) : (
				<p>
					{searchQuery
						? `No articles matching "${searchQuery}".`
						: activeTag
							? `No articles tagged "${activeTag}".`
							: "No articles found."}
				</p>
			)}
		</div>
	);
}
