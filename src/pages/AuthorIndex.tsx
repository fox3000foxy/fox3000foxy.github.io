import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";

export default function AuthorIndex() {
	const { id } = useParams<{ id: string }>();
	const { t, lang } = useLang();
	const [articles, setArticles] = useState<ArticleMeta[]>([]);

	useEffect(() => {
		if (!id) {
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

	return (
		<div className="blog-list">
			<h2>
				{t("blog.filter.all")} / @{id}
			</h2>

			{articles.length > 0 ? (
				<div className="blog-grid">
					{articles.map(
						({ slug, title, description, date, aiGenerated, tags }) => (
							<Link to={`/blog/${slug}`} key={slug} className="blog-card">
								<div className="blog-card-body">
									<h3 className="blog-card-title">
										{title ?? slug.replace(/-/g, " ")}
									</h3>
									{aiGenerated && (
										<span className="ai-badge">{t("article.ai")}</span>
									)}
									{description && (
										<p className="blog-card-desc">{description}</p>
									)}
									{tags && tags.length > 0 && (
										<div className="blog-card-tags">
											{tags.map((t) => (
												<span key={t} className="tag-badge">
													{t}
												</span>
											))}
										</div>
									)}
								</div>
								{date && (
									<div className="blog-card-footer">
										<time dateTime={date}>
											{new Date(`${date}T00:00:00`).toLocaleDateString(lang, {
												year: "numeric",
												month: "long",
												day: "numeric",
											})}
										</time>
									</div>
								)}
							</Link>
						)
					)}
				</div>
			) : (
				<p>{t("notFound.article", { slug: id || "" })}</p>
			)}
		</div>
	);
}
