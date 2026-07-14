import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/BlogList.css";
import { getCachedArticleMarkdown, prefetchArticleMarkdown, prefetchMarkdownEntries, } from "../utils/articleCache";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";
import BlogCard from "../components/BlogCard";
const PAGE_SIZE = 15;
export default function BlogList() {
    const { t, lang } = useLang();
    const navigate = useNavigate();
    const [articles, setArticles] = useState([]);
    const [activeTag, setActiveTag] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(0);
    useEffect(() => {
        const indexUrl = `/articles/${lang}/index.json`;
        const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";
        async function load() {
            let res = await fetch(cacheBust(indexUrl));
            if (!res.ok && fallbackUrl) {
                res = await fetch(cacheBust(fallbackUrl));
            }
            if (!res.ok) {
                setArticles([]);
                return;
            }
            const data = await res.json();
            if (Array.isArray(data)) {
                // biome-ignore lint/suspicious/noExplicitAny: legacy string format
                const normalized = data.map((item) => typeof item === "string" ? { slug: item } : item);
                normalized.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
                setArticles(normalized);
                const slugs = normalized.map((item) => item.slug).filter(Boolean);
                prefetchArticleMarkdown(slugs, lang);
                if (lang !== "en") {
                    prefetchArticleMarkdown(slugs, "en");
                }
                prefetchMarkdownEntries([
                    { key: "home", url: "/home.md" },
                    { key: "portfolio", url: "/portfolio.md" },
                ]);
            }
            else {
                setArticles([]);
            }
        }
        void load();
    }, [lang]);
    const query = searchQuery.toLowerCase().trim();
    const allTags = useMemo(() => [...new Set(articles.flatMap((a) => a.tags ?? []))].sort(), [articles]);
    const filtered = useMemo(() => articles.filter((a) => {
        if (activeTag && !a.tags?.includes(activeTag)) {
            return false;
        }
        if (!query) {
            return true;
        }
        const text = getCachedArticleMarkdown(a.slug, lang) ??
            getCachedArticleMarkdown(a.slug, "en");
        return (a.title?.toLowerCase().includes(query) ||
            a.description?.toLowerCase().includes(query) ||
            a.tags?.some((t) => t.toLowerCase().includes(query)) ||
            (text?.toLowerCase().includes(query) ?? false));
    }), [articles, activeTag, query, lang]);
    const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
    const safePage = Math.min(page, Math.max(0, pageCount - 1));
    const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
    useEffect(() => {
        setPage(0);
    }, [activeTag, searchQuery]);
    function randomArticle() {
        if (filtered.length === 0) {
            return;
        }
        const slug = filtered[Math.floor(Math.random() * filtered.length)].slug;
        void navigate(`/blog/${slug}`);
    }
    return (_jsxs("div", { className: "blog-list", children: [_jsxs("div", { className: "blog-list-header", children: [_jsx("h2", { children: t("blog.title") }), filtered.length > 0 && (_jsxs("button", { type: "button", className: "random-btn", onClick: randomArticle, children: ["\uD83C\uDFB2 ", t("blog.random")] }))] }), _jsxs("div", { className: "search-bar", children: [_jsx("input", { type: "search", placeholder: t("blog.search"), value: searchQuery, onChange: (e) => setSearchQuery(e.target.value) }), searchQuery && (_jsx("button", { type: "button", className: "search-clear", onClick: () => setSearchQuery(""), "aria-label": t("search.clear"), children: "\u00D7" }))] }), allTags.length > 0 && (_jsxs("div", { className: "tag-filter", children: [_jsx("button", { type: "button", className: `tag-btn${activeTag === null ? " active" : ""}`, onClick: () => setActiveTag(null), children: t("blog.filter.all") }), allTags.map((tag) => (_jsx("button", { type: "button", className: `tag-btn${activeTag === tag ? " active" : ""}`, onClick: () => setActiveTag(tag), children: tag }, tag)))] })), filtered.length > 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "blog-grid", children: paged.map((article) => (_jsx(BlogCard, { article: article }, article.slug))) }), pageCount > 1 && (_jsxs("div", { className: "pagination", children: [_jsx("button", { type: "button", disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2190" }), _jsxs("span", { children: [page + 1, " / ", pageCount] }), _jsx("button", { type: "button", disabled: page >= pageCount - 1, onClick: () => setPage(page + 1), children: "\u2192" })] }))] })) : (_jsx("p", { children: searchQuery
                    ? t("blog.no.match", { query: searchQuery })
                    : activeTag
                        ? t("blog.no.tag", { tag: activeTag })
                        : t("blog.no.articles") }))] }));
}
