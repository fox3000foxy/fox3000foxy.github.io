import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";
import {
	getCachedArticleMarkdown,
	fetchArticleMarkdown,
} from "../utils/articleCache";
import {
	computeRecommendations,
	type ScoredArticle,
} from "../utils/recommendations";
import { useLang } from "../hooks/useLang";

interface SuggestedArticlesProps {
	currentSlug: string;
	currentTags: string[];
	allArticles: ArticleMeta[];
	lang: string;
}

function tagOverlap(a: string[], b: string[]): number {
	return a.filter((t) => b.includes(t)).length;
}

export default function SuggestedArticles({
	currentSlug,
	currentTags,
	allArticles,
	lang,
}: SuggestedArticlesProps) {
	const { t } = useLang();
	const [recommendations, setRecommendations] = useState<
		ScoredArticle[] | null
	>(null);

	useEffect(() => {
		const others = allArticles.filter((a) => a.slug !== currentSlug);
		if (others.length === 0) {
			return;
		}

		const cached: { slug: string; text: string }[] = [];
		let allCached = true;
		for (const a of others) {
			const text =
				getCachedArticleMarkdown(a.slug, lang) ??
				getCachedArticleMarkdown(a.slug, "en");
			if (text === null) {
				allCached = false;
			} else {
				cached.push({ slug: a.slug, text });
			}
		}

		if (allCached && cached.length > 0) {
			const own =
				getCachedArticleMarkdown(currentSlug, lang) ??
				getCachedArticleMarkdown(currentSlug, "en");
			if (own !== null) {
				cached.push({ slug: currentSlug, text: own });
			}
			const results = computeRecommendations(cached, currentSlug);
			setRecommendations(results);
		} else {
			setRecommendations(null);
			const slugs = others.map((a) => a.slug);
			void fetchRecommendations(slugs);
		}

		async function fetchRecommendations(slugs: string[]) {
			const results = await Promise.all(
				slugs.map((slug) =>
					Promise.resolve(fetchArticleMarkdown(slug, lang)).then((text) =>
						text === null ? null : ({ slug, text } as const)
					)
				)
			);
			const entries: { slug: string; text: string }[] = results.filter(
				(r): r is { slug: string; text: string } => r !== null
			);
			const own = await Promise.resolve(
				fetchArticleMarkdown(currentSlug, lang)
			);
			if (own !== null) {
				entries.push({ slug: currentSlug, text: own });
			}
			if (entries.length > 1) {
				const results = computeRecommendations(entries, currentSlug);
				setRecommendations(results);
			}
		}
	}, [currentSlug, allArticles, lang]);

	const scored = useMemo(() => {
		if (recommendations && recommendations.length > 0) {
			return recommendations
				.map((r) => ({
					article: allArticles.find((a) => a.slug === r.slug),
					score: r.score,
				}))
				.filter(
					(s): s is { article: ArticleMeta; score: number } =>
						s.article !== undefined
				)
				.slice(0, 4);
		}

		return allArticles
			.filter((a) => a.slug !== currentSlug)
			.map((a) => ({
				article: a,
				score: tagOverlap(currentTags, a.tags ?? []),
			}))
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 3);
	}, [recommendations, allArticles, currentSlug, currentTags]);

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
								{new Date(`${article.date}T00:00:00`).toLocaleDateString(lang, {
									year: "numeric",
									month: "long",
									day: "numeric",
								})}
							</time>
						)}
					</Link>
				))}
			</div>
		</section>
	);
}
