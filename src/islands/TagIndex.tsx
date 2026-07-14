import { useMemo } from "react";
import { useNavigate, useParams } from "../lib/navigation";
import "../styles/BlogList.css";
import { useLang } from "../hooks/useLang";
import type { ArticleMeta } from "../types";
import BlogCard from "../components/BlogCard";

interface TagIndexProps {
	allIndexes?: Record<string, unknown[]>;
}

export default function TagIndex({ allIndexes }: TagIndexProps) {
	const { tag } = useParams<{ tag: string }>();
	const { t, lang } = useLang();
	const navigate = useNavigate();

	const articles = useMemo(() => {
		if (!tag) {
			return [];
		}
		const data = allIndexes?.[lang] ?? allIndexes?.en ?? [];
		const normalized = (data as { slug?: string }[]).map((item) =>
			typeof item === "string" ? { slug: item } : item
		) as ArticleMeta[];
		return normalized
			.filter((a) => a.tags?.includes(tag!))
			.sort(
				(a, b) =>
					new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
			);
	}, [allIndexes, lang, tag]);

	return (
		<div className="blog-list">
			<div className="tag-page-header">
				<button
					type="button"
					className="tag-page-back"
					onClick={() => {
						if (window.history.length > 1) {
							void navigate(-1);
						} else {
							void navigate("/blog");
						}
					}}
				>
					← {t("blog.title")}
				</button>
				<h2>#{tag}</h2>
			</div>

			{articles.length > 0 ? (
				<div className="blog-grid">
					{articles.map((article) => (
						<BlogCard key={article.slug} article={article} />
					))}
				</div>
			) : (
				<p>{t("blog.no.tag", { tag: tag || "" })}</p>
			)}
		</div>
	);
}
