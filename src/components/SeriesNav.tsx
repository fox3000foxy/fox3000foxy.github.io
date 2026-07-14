import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";

export default function SeriesNav({
	series,
	currentSlug,
	allArticles,
}: {
	series: string;
	currentSlug: string;
	allArticles: ArticleMeta[];
}) {
	const siblings = useMemo(
		() =>
			allArticles
				.filter((a) => a.series === series && a.slug !== currentSlug)
				.sort(
					(a, b) =>
						new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()
				),
		[series, currentSlug, allArticles]
	);

	if (siblings.length === 0) {
		return null;
	}

	return (
		<div className="series-nav">
			<h4 className="series-title">Series: {series}</h4>
			<ul className="series-list">
				{siblings.map((a) => (
					<li key={a.slug}>
						<Link to={`/blog/${a.slug}`}>{a.title ?? a.slug}</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
