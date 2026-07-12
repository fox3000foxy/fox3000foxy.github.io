import { Link } from "react-router-dom";
import type { ArticleMeta } from "../types";
import { useLang } from "../hooks/useLang";
import { useReadStatus } from "../hooks/useReadStatus";
import BookmarkButton from "./BookmarkButton";
import { getAuthors } from "../utils/authors";
import { isNew } from "../utils/isNew";

interface BlogCardProps {
	article: ArticleMeta;
}

export default function BlogCard({ article }: BlogCardProps) {
	const { t, lang } = useLang();
	const { markAsRead, isRead } = useReadStatus();
	const {
		slug,
		title,
		description,
		date,
		readingTime,
		aiGenerated,
		sponsored,
		tags,
		authors,
	} = article;

	return (
		<Link
			to={`/blog/${slug}`}
			className={`blog-card${isRead(slug) ? " read" : ""}`}
			onClick={() => markAsRead(slug)}
		>
			<div className="blog-card-body">
				<h3 className="blog-card-title">{title ?? slug?.replace(/-/g, " ")}</h3>
				{((isNew(date) && !isRead(slug)) || aiGenerated || sponsored) && (
					<div className="blog-card-badges">
						{isNew(date) && !isRead(slug) && (
							<span className="new-badge">NEW</span>
						)}
						{aiGenerated && <span className="ai-badge">{t("article.ai")}</span>}
						{sponsored && (
							<span className="sponsored-badge">💕 Sponsorisé</span>
						)}
					</div>
				)}
				{description && <p className="blog-card-desc">{description}</p>}
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
			<div className="blog-card-footer">
				<div className="blog-card-meta">
					{date && (
						<time dateTime={date}>
							{new Date(`${date}T00:00:00`).toLocaleDateString(lang, {
								year: "numeric",
								month: "long",
								day: "numeric",
							})}
						</time>
					)}
					{readingTime && (
						<span className="blog-card-reading-time">
							{t("article.minRead", { n: readingTime })}
						</span>
					)}
				</div>
				<div className="blog-card-authors">
					{getAuthors(authors).map((a) => (
						<img
							key={a.id}
							className="blog-card-author-avatar"
							src={a.avatar ?? `https://github.com/${a.id}.png`}
							alt={a.name}
							title={a.name}
						/>
					))}
				</div>
				<BookmarkButton slug={slug} />
			</div>
		</Link>
	);
}
