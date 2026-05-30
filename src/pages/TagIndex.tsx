import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";
import BlogCard from "../components/BlogCard";

export default function TagIndex() {
	const { tag } = useParams<{ tag: string }>();
	const { t, lang } = useLang();
	const navigate = useNavigate();
	const [articles, setArticles] = useState<ArticleMeta[]>([]);

	useEffect(() => {
		if (!tag) {
			return;
		}

		const indexUrl = `/articles/${lang}/index.json`;
		const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";

		async function load() {
			let res = await fetch(indexUrl);
			if (!res.ok && fallbackUrl) {
				res = await fetch(fallbackUrl);
			}
			if (!res.ok) {
				return;
			}

			const data: unknown = await res.json();
			if (Array.isArray(data)) {
				// biome-ignore lint/suspicious/noExplicitAny: legacy string format
				const normalized: ArticleMeta[] = (data as any[]).map(
					// biome-ignore lint/suspicious/noExplicitAny: legacy string format
					(item: any) => (typeof item === "string" ? { slug: item } : item)
				);
				const filtered = normalized
					.filter((a) => a.tags?.includes(tag!))
					.sort(
						(a, b) =>
							new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
					);
				setArticles(filtered);
			}
		}
		void load();
	}, [tag, lang]);

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
