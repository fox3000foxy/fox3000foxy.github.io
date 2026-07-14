import { useMemo } from "react";
import { Link } from "../lib/navigation";
import { useLang } from "../hooks/useLang";
import type { ArticleMeta } from "../types";

interface TagsIndexProps {
	allIndexes?: Record<string, unknown[]>;
}

export default function TagsIndex({ allIndexes }: TagsIndexProps) {
	const { t, lang } = useLang();
	const articles = useMemo(() => {
		const data = allIndexes?.[lang] ?? allIndexes?.en ?? [];
		return (data as { slug?: string }[]).map((item) =>
			typeof item === "string" ? { slug: item } : item
		) as ArticleMeta[];
	}, [allIndexes, lang]);

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
