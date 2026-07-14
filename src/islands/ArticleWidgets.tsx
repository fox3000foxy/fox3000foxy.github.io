import { useMemo } from "react";
import { Link } from "../lib/navigation";
import BookmarkButton from "../components/BookmarkButton";
import GiscusComments from "../components/GiscusComments";
import LazyVisible from "../components/LazyVisible";
import SuggestedArticles from "../components/SuggestedArticles";
import { useLang } from "../hooks/useLang";
import type { ArticleMeta } from "../types";

interface WidgetProps {
	slug: string;
	allIndexes?: Record<string, unknown[]>;
	verified?: boolean;
	rawMarkdown?: string;
}

export default function ArticleWidgets({ slug, allIndexes }: WidgetProps) {
	const { t, lang } = useLang();

	const allArticles = useMemo(() => {
		const indexData = allIndexes?.[lang] ?? allIndexes?.en ?? [];
		if (indexData.length === 0) {
			return [];
		}
		return (indexData as { slug?: string }[]).map((item) =>
			typeof item === "string" ? { slug: item } : item
		) as ArticleMeta[];
	}, [allIndexes, lang]);

	const sorted = useMemo(() => {
		return [...allArticles].sort(
			(a, b) =>
				new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
		);
	}, [allArticles]);

	const idx = sorted.findIndex((a) => a.slug === slug);
	const prevArticle = idx < sorted.length - 1 ? sorted[idx + 1] : null;
	const nextArticle = idx > 0 ? sorted[idx - 1] : null;

	const meta = sorted.find((a) => a.slug === slug) || null;

	return (
		<div className="article-widgets-bottom">
			<div className="share-buttons widget-bookmark">
				<BookmarkButton slug={slug} />
			</div>
			{meta?.tags && meta.tags.length > 0 && (
				<LazyVisible rootMargin="400px" height="200px">
					<SuggestedArticles
						currentSlug={slug}
						currentTags={meta.tags}
						allArticles={allArticles}
						lang={lang}
					/>
				</LazyVisible>
			)}
			{(prevArticle || nextArticle) && (
				<nav className="article-nav">
					{prevArticle && (
						<Link
							to={`/blog/${prevArticle.slug}`}
							className="article-nav-link prev"
						>
							<span className="article-nav-label">{t("article.prev")}</span>
							<span className="article-nav-title">{prevArticle.title}</span>
						</Link>
					)}
					{nextArticle && (
						<Link
							to={`/blog/${nextArticle.slug}`}
							className="article-nav-link next"
						>
							<span className="article-nav-label">{t("article.next")}</span>
							<span className="article-nav-title">{nextArticle.title}</span>
						</Link>
					)}
				</nav>
			)}
			<LazyVisible rootMargin="400px" height="350px">
				<GiscusComments lang={lang} />
			</LazyVisible>
		</div>
	);
}
