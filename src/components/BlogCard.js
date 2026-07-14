import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import { useReadStatus } from "../hooks/useReadStatus";
import BookmarkButton from "./BookmarkButton";
import { getAuthors } from "../utils/authors";
import { isNew } from "../utils/isNew";
export default function BlogCard({ article }) {
    const { t, lang } = useLang();
    const { markAsRead, isRead } = useReadStatus();
    const { slug, title, description, date, readingTime, aiGenerated, sponsored, tags, authors, } = article;
    const formattedDate = useMemo(() => date
        ? new Date(`${date}T00:00:00`).toLocaleDateString(lang, {
            year: "numeric",
            month: "long",
            day: "numeric",
        })
        : null, [date, lang]);
    const authorElements = useMemo(() => getAuthors(authors).map((a) => (_jsx("img", { className: "blog-card-author-avatar", src: a.avatar ?? `https://github.com/${a.id}.png`, alt: a.name, title: a.name, width: "20", height: "20" }, a.id))), [authors]);
    return (_jsxs(Link, { to: `/blog/${slug}`, className: `blog-card${isRead(slug) ? " read" : ""}`, onClick: () => markAsRead(slug), children: [_jsxs("div", { className: "blog-card-body", children: [_jsx("h3", { className: "blog-card-title", children: title ?? slug?.replace(/-/g, " ") }), ((isNew(date) && !isRead(slug)) || aiGenerated || sponsored) && (_jsxs("div", { className: "blog-card-badges", children: [isNew(date) && !isRead(slug) && (_jsx("span", { className: "new-badge", children: "NEW" })), aiGenerated && _jsx("span", { className: "ai-badge", children: t("article.ai") }), sponsored && (_jsx("span", { className: "sponsored-badge", children: "\uD83D\uDC95 Sponsoris\u00E9" }))] })), description && _jsx("p", { className: "blog-card-desc", children: description }), tags && tags.length > 0 && (_jsx("div", { className: "blog-card-tags", children: tags.map((t) => (_jsx("span", { className: "tag-badge", children: t }, t))) }))] }), _jsxs("div", { className: "blog-card-footer", children: [_jsxs("div", { className: "blog-card-meta", children: [formattedDate && _jsx("time", { dateTime: date, children: formattedDate }), readingTime && (_jsx("span", { className: "blog-card-reading-time", children: t("article.minRead", { n: readingTime }) }))] }), _jsx("div", { className: "blog-card-authors", children: authorElements }), _jsx(BookmarkButton, { slug: slug })] })] }));
}
