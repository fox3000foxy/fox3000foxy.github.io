import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Link } from "react-router-dom";
export default function SeriesNav({ series, currentSlug, allArticles, }) {
    const siblings = useMemo(() => allArticles
        .filter((a) => a.series === series && a.slug !== currentSlug)
        .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()), [series, currentSlug, allArticles]);
    if (siblings.length === 0) {
        return null;
    }
    return (_jsxs("div", { className: "series-nav", children: [_jsxs("h4", { className: "series-title", children: ["Series: ", series] }), _jsx("ul", { className: "series-list", children: siblings.map((a) => (_jsx("li", { children: _jsx(Link, { to: `/blog/${a.slug}`, children: a.title ?? a.slug }) }, a.slug))) })] }));
}
