import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCachedArticleMarkdown, fetchArticleMarkdown, } from "../utils/articleCache";
import { computeRecommendations, } from "../utils/recommendations";
import { useLang } from "../hooks/useLang";
function tagOverlap(a, b) {
    return a.filter((t) => b.includes(t)).length;
}
export default function SuggestedArticles({ currentSlug, currentTags, allArticles, lang, }) {
    const { t } = useLang();
    const [recommendations, setRecommendations] = useState(null);
    useEffect(() => {
        const others = allArticles.filter((a) => a.slug !== currentSlug);
        if (others.length === 0) {
            return;
        }
        const cached = [];
        let allCached = true;
        for (const a of others) {
            const text = getCachedArticleMarkdown(a.slug, lang) ??
                getCachedArticleMarkdown(a.slug, "en");
            if (text === null) {
                allCached = false;
            }
            else {
                cached.push({ slug: a.slug, text });
            }
        }
        if (allCached && cached.length > 0) {
            const own = getCachedArticleMarkdown(currentSlug, lang) ??
                getCachedArticleMarkdown(currentSlug, "en");
            if (own !== null) {
                cached.push({ slug: currentSlug, text: own });
            }
            const results = computeRecommendations(cached, currentSlug);
            setRecommendations(results);
        }
        else {
            setRecommendations(null);
            const slugs = others.map((a) => a.slug);
            void fetchRecommendations(slugs);
        }
        async function fetchRecommendations(slugs) {
            const results = await Promise.all(slugs.map((slug) => Promise.resolve(fetchArticleMarkdown(slug, lang)).then((text) => text === null ? null : { slug, text })));
            const entries = results.filter((r) => r !== null);
            const own = await Promise.resolve(fetchArticleMarkdown(currentSlug, lang));
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
                .filter((s) => s.article !== undefined)
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
    return (_jsxs("section", { className: "suggested-articles", children: [_jsx("h3", { children: t("article.related") }), _jsx("div", { className: "suggested-grid", children: scored.map(({ article }) => (_jsxs(Link, { to: `/blog/${article.slug}`, className: "suggested-card", children: [_jsx("h4", { className: "suggested-title", children: article.title ?? article.slug.replace(/-/g, " ") }), article.description && (_jsx("p", { className: "suggested-desc", children: article.description })), article.date && (_jsx("time", { className: "suggested-date", dateTime: article.date, children: new Date(`${article.date}T00:00:00`).toLocaleDateString(lang, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            }) }))] }, article.slug))) })] }));
}
