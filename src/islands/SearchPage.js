import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import { getCachedArticleMarkdown, prefetchArticleMarkdown, } from "../utils/articleCache";
import { cacheBust } from "../utils/cacheBust";
import "../styles/SearchPage.css";
export default function SearchPage() {
    const { t, lang } = useLang();
    const [articles, setArticles] = useState([]);
    const [query, setQuery] = useState("");
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
            const data = await res.json();
            if (Array.isArray(data)) {
                const normalized = data.map((item) => typeof item === "string" ? { slug: item } : item);
                setArticles(normalized);
                prefetchArticleMarkdown(normalized.map((a) => a.slug).filter(Boolean), lang);
            }
        }
        void load();
    }, [lang]);
    const q = query.toLowerCase().trim();
    const results = useMemo(() => {
        if (!q) {
            return [];
        }
        return articles.filter((a) => {
            const text = getCachedArticleMarkdown(a.slug, lang) ??
                getCachedArticleMarkdown(a.slug, "en");
            return (a.title?.toLowerCase().includes(q) ||
                a.description?.toLowerCase().includes(q) ||
                a.tags?.some((t) => t.toLowerCase().includes(q)) ||
                (text?.toLowerCase().includes(q) ?? false));
        });
    }, [q, articles, lang]);
    return (_jsxs("article", { className: "search-page", children: [_jsx("h1", { children: t("search.title") }), _jsxs("div", { className: "search-bar search-page-bar", children: [_jsx("input", { type: "search", placeholder: t("search.placeholder"), value: query, onChange: (e) => setQuery(e.target.value) }), query && (_jsx("button", { type: "button", className: "search-clear", onClick: () => setQuery(""), "aria-label": t("search.clear"), children: "\u00D7" }))] }), _jsx("p", { className: "search-hint", children: t("search.hint") }), query && (_jsx("p", { className: "search-summary", children: t("search.results", { n: results.length, query }) })), query && results.length === 0 && (_jsx("p", { className: "search-no-results", children: t("search.no.results", { query }) })), results.length > 0 && (_jsx("div", { className: "search-results", children: results.map((article) => (_jsxs(Link, { to: `/blog/${article.slug}`, className: "search-result-card", children: [_jsx("h3", { children: article.title || article.slug }), article.description && (_jsx("p", { className: "search-result-desc", children: article.description })), _jsxs("div", { className: "search-result-meta", children: [article.date && (_jsx("span", { className: "search-result-date", children: article.date })), article.tags && article.tags.length > 0 && (_jsx("div", { className: "search-result-tags", children: article.tags.map((tag) => (_jsx("span", { className: "tag-badge", children: tag }, tag))) }))] })] }, article.slug))) }))] }));
}
