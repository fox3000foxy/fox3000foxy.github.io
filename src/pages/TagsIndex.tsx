import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";

export default function TagsIndex() {
	const { t, lang } = useLang();
	const [articles, setArticles] = useState<ArticleMeta[]>([]);

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
				setArticles(
					data.map((item) => (typeof item === "string" ? { slug: item } : item))
				);
			}
		}
		void load();
	}, [lang]);

	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const a of articles) {
			for (const tag of a.tags ?? []) {
				counts.set(tag, (counts.get(tag) || 0) + 1);
			}
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1]);
	}, [articles]);

	return (
		<div className="tags-index">
			<h2>{t("tags.title")}</h2>
			{tagCounts.length === 0 ? (
				<p>{t("blog.no.articles")}</p>
			) : (
				<div className="tags-cloud">
					{tagCounts.map(([tag, count]) => (
						<Link key={tag} to={`/tags/${tag}`} className="tag-cloud-item">
							<span className="tag-label">{tag}</span>
							<span className="tag-count">{count}</span>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
