import { useMemo, useState } from "react";
import { useNavigate } from "../lib/navigation";
import "../styles/BlogList.css";
import { useLang } from "../hooks/useLang";
import BlogCard from "../components/BlogCard";
import type { ArticleMeta } from "../types";

const PAGE_SIZE = 15;

interface BlogListProps {
	allIndexes?: Record<string, unknown[]>;
}

function normalizeArticles(data: unknown[]): ArticleMeta[] {
	return (data as { slug?: string }[]).map((item) =>
		typeof item === "string" ? { slug: item } : item
	) as ArticleMeta[];
}

export default function BlogList({ allIndexes }: BlogListProps) {
	const { t, lang } = useLang();
	const navigate = useNavigate();
	const [activeTag, setActiveTag] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(0);

	const langArticles = allIndexes?.[lang] ?? allIndexes?.en ?? [];
	const enArticles = allIndexes?.en ?? [];
	const articles = useMemo(() => {
		const raw = langArticles.length > 0 ? langArticles : enArticles;
		const list = normalizeArticles(raw);
		list.sort(
			(a, b) =>
				new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
		);
		return list;
	}, [langArticles, enArticles]);

	const query = searchQuery.toLowerCase().trim();

	const allTags = useMemo(
		() => [...new Set(articles.flatMap((a) => a.tags ?? []))].sort(),
		[articles]
	);

	const filtered = useMemo(
		() =>
			articles.filter((a) => {
				if (activeTag && !a.tags?.includes(activeTag)) {
					return false;
				}
				if (!query) {
					return true;
				}
				return (
					a.title?.toLowerCase().includes(query) ||
					a.description?.toLowerCase().includes(query) ||
					a.tags?.some((t) => t.toLowerCase().includes(query))
				);
			}),
		[articles, activeTag, query]
	);

	const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
	const safePage = Math.min(page, Math.max(0, pageCount - 1));
	const paged = filtered.slice(
		safePage * PAGE_SIZE,
		(safePage + 1) * PAGE_SIZE
	);

	return (
		<div className="blog-list">
			<div className="blog-list-header">
				<h2>{t("blog.title")}</h2>
				{filtered.length > 0 && (
					<button
						type="button"
						className="random-btn"
						onClick={() => {
							const slug =
								filtered[Math.floor(Math.random() * filtered.length)].slug;
							void navigate(`/blog/${slug}`);
						}}
					>
						🎲 {t("blog.random")}
					</button>
				)}
			</div>

			<div className="search-bar">
				<input
					type="search"
					placeholder={t("blog.search")}
					value={searchQuery}
					onChange={(e) => {
						setSearchQuery(e.target.value);
						setPage(0);
					}}
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
						onClick={() => {
							setActiveTag(null);
							setPage(0);
						}}
					>
						{t("blog.filter.all")}
					</button>
					{allTags.map((tag) => (
						<button
							type="button"
							key={tag}
							className={`tag-btn${activeTag === tag ? " active" : ""}`}
							onClick={() => {
								setActiveTag(tag);
								setPage(0);
							}}
						>
							{tag}
						</button>
					))}
				</div>
			)}

			{filtered.length > 0 ? (
				<>
					<div className="blog-grid">
						{paged.map((article) => (
							<BlogCard key={article.slug} article={article} />
						))}
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
