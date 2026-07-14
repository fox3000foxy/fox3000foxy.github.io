import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";
export default function TagsIndex() {
    const { t, lang } = useLang();
    const [articles, setArticles] = useState([]);
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
                setArticles(data.map((item) => (typeof item === "string" ? { slug: item } : item)));
            }
        }
        void load();
    }, [lang]);
    const tagCounts = useMemo(() => {
        const counts = new Map();
        for (const a of articles) {
            for (const tag of a.tags ?? []) {
                counts.set(tag, (counts.get(tag) || 0) + 1);
            }
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [articles]);
    return (_jsxs("div", { className: "tags-index", children: [_jsx("h2", { children: t("tags.title") }), tagCounts.length === 0 ? (_jsx("p", { children: t("blog.no.articles") })) : (_jsx("div", { className: "tags-cloud", children: tagCounts.map(([tag, count]) => (_jsxs(Link, { to: `/tags/${tag}`, className: "tag-cloud-item", children: [_jsx("span", { className: "tag-label", children: tag }), _jsx("span", { className: "tag-count", children: count })] }, tag))) }))] }));
}
