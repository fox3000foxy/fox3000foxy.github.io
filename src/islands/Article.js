import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import ArticleSchema from "../components/ArticleSchema";
import AudioPlayer from "../components/AudioPlayer";
import AuthorBio from "../components/AuthorBio";
import BookmarkButton from "../components/BookmarkButton";
import GiscusComments from "../components/GiscusComments";
import LazyVisible from "../components/LazyVisible";
import MarkdownContent from "../components/MarkdownContent";
import ReadingProgress from "../components/ReadingProgress";
import SeriesNav from "../components/SeriesNav";
import ShareButtons from "../components/ShareButtons";
import SuggestedArticles from "../components/SuggestedArticles";
import TableOfContents from "../components/TableOfContents";
import { useLang } from "../hooks/useLang";
import { useReadingMode } from "../hooks/useReadingMode";
import { useReadStatus } from "../hooks/useReadStatus";
import { fetchArticleMarkdown, getCachedArticleMarkdown, } from "../utils/articleCache";
import { cacheBust } from "../utils/cacheBust";
import { parseFrontMatter } from "../utils/frontmatter";
import { isNew } from "../utils/isNew";
import { verifyArticle } from "../utils/verify";
import NotFound from "./NotFound";
function processArticleContent(text) {
    return text.replaceAll("assets/", "/articles/assets/");
}
function estimateReadingTime(text) {
    // Remove code blocks (backtick-fenced code)
    const noCode = text.replace(/```[\s\S]*?```/g, "");
    // Remove inline code
    const clean = noCode.replace(/`[^`]+`/g, "");
    const words = clean.trim().split(/\s+/).length;
    // Technical text is read slower; use 150 wpm
    return Math.max(1, Math.ceil(words / 150));
}
export default function Article() {
    const { slug } = useParams();
    const { t, lang } = useLang();
    const location = useLocation();
    const readingMode = useReadingMode();
    const { markAsRead } = useReadStatus();
    const [content, setContent] = useState(null);
    const [rawContent, setRawContent] = useState(null);
    const [error, setError] = useState(false);
    const [meta, setMeta] = useState(null);
    const [allArticles, setAllArticles] = useState([]);
    const [verified, setVerified] = useState(false);
    useEffect(() => {
        if (!slug) {
            return;
        }
        let cancelled = false;
        let metaTimer;
        markAsRead(slug);
        function process(text) {
            const { meta, content } = parseFrontMatter(text);
            return {
                clean: processArticleContent(content),
                raw: content,
                frontMeta: meta,
            };
        }
        const cached = getCachedArticleMarkdown(slug, lang);
        if (cached === null) {
            Promise.resolve(fetchArticleMarkdown(slug, lang))
                .then((text) => {
                if (cancelled) {
                    return;
                }
                if (!text) {
                    setError(true);
                    return;
                }
                const { clean, raw, frontMeta } = process(text);
                setContent(clean);
                setRawContent(raw);
                setMeta((prev) => prev
                    ? { ...prev, ...frontMeta }
                    : { slug: slug, ...frontMeta });
            })
                .catch(() => {
                if (!cancelled) {
                    setError(true);
                }
            });
        }
        else {
            const { clean, raw, frontMeta } = process(cached);
            setContent(clean);
            setRawContent(raw);
            metaTimer = setTimeout(() => {
                if (!cancelled) {
                    setMeta((prev) => prev
                        ? { ...prev, ...frontMeta }
                        : { slug: slug, ...frontMeta });
                }
            }, 0);
        }
        const controller = new AbortController();
        async function loadIndex() {
            const indexUrl = `/articles/${lang}/index.json`;
            const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";
            try {
                let res = await fetch(cacheBust(indexUrl), {
                    signal: controller.signal,
                });
                if (!res.ok && fallbackUrl) {
                    res = await fetch(cacheBust(fallbackUrl), {
                        signal: controller.signal,
                    });
                }
                if (!res.ok) {
                    return;
                }
                const data = await res.json();
                if (cancelled) {
                    return;
                }
                if (Array.isArray(data)) {
                    // biome-ignore lint/suspicious/noExplicitAny: need to handle legacy string format
                    const normalized = data.map((item) => typeof item === "string" ? { slug: item } : item);
                    setAllArticles(normalized);
                    setMeta((prev) => {
                        const fromIndex = normalized.find((a) => a.slug === slug) || null;
                        return prev ? { ...fromIndex, ...prev } : fromIndex;
                    });
                }
            }
            catch {
                // aborted or network error
            }
        }
        void loadIndex();
        return () => {
            cancelled = true;
            clearTimeout(metaTimer);
            controller.abort();
        };
    }, [slug, lang, markAsRead]);
    // Scroll to anchor hash when content is loaded
    useEffect(() => {
        if (!(content && location.hash)) {
            return;
        }
        let cancelled = false;
        const id = decodeURIComponent(location.hash.slice(1));
        let attempts = 0;
        const tryScroll = () => {
            if (cancelled) {
                return;
            }
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            else if (attempts < 10) {
                attempts++;
                setTimeout(tryScroll, 200);
            }
        };
        const t = setTimeout(tryScroll, 100);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [content, location.hash]);
    // Verify article signature
    useEffect(() => {
        if (!(slug && meta?.author_sig && rawContent)) {
            return;
        }
        const author = meta.authors?.[0] || "";
        const date = meta.date || "";
        verifyArticle(slug, author, date, rawContent, meta.author_sig)
            .then(setVerified)
            .catch(() => setVerified(false));
    }, [slug, meta, rawContent]);
    const sorted = useMemo(() => {
        return [...allArticles].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    }, [allArticles]);
    const idx = sorted.findIndex((a) => a.slug === slug);
    const prevArticle = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    const nextArticle = idx > 0 ? sorted[idx - 1] : null;
    const readingTime = useMemo(() => estimateReadingTime(content ?? ""), [content]);
    if (error) {
        return _jsx(NotFound, { message: t("notFound.article", { slug: slug || "" }) });
    }
    if (content === null) {
        return _jsx("p", { children: t("article.error") });
    }
    return (_jsxs(_Fragment, { children: [meta && slug && _jsx(ArticleSchema, { meta: meta, slug: slug }), _jsxs("article", { children: [_jsx(ReadingProgress, {}), isNew(meta?.date) && _jsx("span", { className: "new-badge", children: "NEW" }), meta?.aiGenerated && (_jsx("span", { className: "ai-badge", children: t("article.ai") })), meta?.sponsored && (_jsx("span", { className: "sponsored-badge", children: "\uD83D\uDC95 Sponsoris\u00E9" })), _jsx("h1", { className: "article-title", children: meta?.title ?? slug ?? "" }), _jsxs("p", { className: "article-date", children: [meta?.date && _jsx("time", { dateTime: meta.date, children: meta.date }), meta?.lastmod && meta.lastmod !== meta.date && (_jsxs(_Fragment, { children: [_jsx("span", { className: "article-sep", children: "\u00B7" }), _jsx("span", { className: "article-updated", children: t("article.updated", { date: meta.lastmod }) })] })), meta?.date && _jsx("span", { className: "article-sep", children: "\u00B7" }), _jsx("span", { children: t("article.minRead", { n: readingTime }) })] }), _jsx(AuthorBio, { authors: meta?.authors, verified: verified }), meta?.description && (_jsx("p", { className: "article-description", children: meta.description })), meta?.tags && meta.tags.length > 0 && (_jsx("div", { className: "article-tags", children: meta.tags.map((tag) => (_jsx(Link, { to: `/tags/${tag}`, className: "tag-badge", children: tag }, tag))) })), _jsx(AudioPlayer, { slug: slug, lang: lang }), _jsxs("div", { className: "share-buttons", children: [_jsx(ShareButtons, { url: window.location.href, title: meta?.title ?? slug ?? "" }), _jsx(BookmarkButton, { slug: slug }), _jsx("button", { type: "button", className: `reading-mode-btn${readingMode.enabled ? " active" : ""}`, onClick: readingMode.toggle, "aria-label": "Toggle reading mode", title: "Reading mode", children: readingMode.enabled ? "Aa" : "Aa" })] }), _jsxs("div", { className: "article-layout", children: [_jsx(TableOfContents, { content: content }), _jsxs("div", { className: "article-content", children: [_jsx(MarkdownContent, { content: content }), meta?.series && (_jsx(SeriesNav, { series: meta.series, currentSlug: slug, allArticles: allArticles })), meta?.tags && meta.tags.length > 0 && (_jsx(LazyVisible, { rootMargin: "400px", height: "200px", children: _jsx(SuggestedArticles, { currentSlug: slug, currentTags: meta.tags, allArticles: allArticles, lang: lang }) })), (prevArticle || nextArticle) && (_jsxs("nav", { className: "article-nav", children: [prevArticle && (_jsxs(Link, { to: `/blog/${prevArticle.slug}`, className: "article-nav-link prev", children: [_jsx("span", { className: "article-nav-label", children: t("article.prev") }), _jsx("span", { className: "article-nav-title", children: prevArticle.title })] })), nextArticle && (_jsxs(Link, { to: `/blog/${nextArticle.slug}`, className: "article-nav-link next", children: [_jsx("span", { className: "article-nav-label", children: t("article.next") }), _jsx("span", { className: "article-nav-title", children: nextArticle.title })] }))] })), _jsx(LazyVisible, { rootMargin: "400px", height: "350px", children: _jsx(GiscusComments, { lang: lang }) })] })] })] })] }));
}
