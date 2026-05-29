import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";

interface SuggestedArticlesProps {
	currentSlug: string;
	currentTags: string[];
	allArticles: ArticleMeta[];
}

function tagOverlap(a: string[], b: string[]): number {
	return a.filter((t) => b.includes(t)).length;
}

export default function SuggestedArticles({
	currentSlug,
	currentTags,
	allArticles,
}: SuggestedArticlesProps) {
	const { t } = useLang();
	const scored = allArticles
		.filter((a) => a.slug !== currentSlug)
		.map((a) => ({
			article: a,
			score: tagOverlap(currentTags, a.tags ?? []),
		}))
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 3);

	if (scored.length === 0) {
		return null;
	}

	return (
		<section className="suggested-articles">
			<h3>{t("article.related")}</h3>
			<div className="suggested-grid">
				{scored.map(({ article }) => (
					<Link
						to={`/blog/${article.slug}`}
						key={article.slug}
						className="suggested-card"
					>
						<h4 className="suggested-title">
							{article.title ?? article.slug.replace(/-/g, " ")}
						</h4>
						{article.description && (
							<p className="suggested-desc">{article.description}</p>
						)}
						{article.date && (
							<time className="suggested-date" dateTime={article.date}>
								{new Date(`${article.date}T00:00:00`).toLocaleDateString(
									"fr-FR",
									{ year: "numeric", month: "long", day: "numeric" }
								)}
							</time>
						)}
					</Link>
				))}
			</div>
		</section>
	);
}
