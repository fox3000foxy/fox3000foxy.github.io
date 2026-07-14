import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/BlogList.css";
import type { ArticleMeta } from "../types";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";
import BlogCard from "../components/BlogCard";
import { getAuthors } from "../utils/authors";

export default function AuthorIndex() {
	const { id } = useParams<{ id: string }>();
	const { t, lang } = useLang();
	const navigate = useNavigate();
	const [articles, setArticles] = useState<ArticleMeta[]>([]);

	useEffect(() => {
		if (!id) {
			return;
		}

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
				// biome-ignore lint/suspicious/noExplicitAny: legacy string format
				const normalized: ArticleMeta[] = (data as any[]).map(
					// biome-ignore lint/suspicious/noExplicitAny: legacy string format
					(item: any) => (typeof item === "string" ? { slug: item } : item)
				);
				const filtered = normalized
					.filter((a) => !a.authors || a.authors.includes(id!))
					.sort(
						(a, b) =>
							new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
					);
				setArticles(filtered);
			}
		}
		void load();
	}, [id, lang]);

	const author = id ? getAuthors([id])[0] : null;

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
				<div className="author-page-title">
					{author && (
						<img
							className="author-page-avatar"
							src={author.avatar ?? `https://github.com/${author.id}.png`}
							alt={author.name}
						/>
					)}
					<h2>{author?.name ?? id}</h2>
				</div>
			</div>

			{articles.length > 0 ? (
				<div className="blog-grid">
					{articles.map((article) => (
						<BlogCard key={article.slug} article={article} />
					))}
				</div>
			) : (
				<p>{t("notFound.article", { slug: id || "" })}</p>
			)}
		</div>
	);
}
