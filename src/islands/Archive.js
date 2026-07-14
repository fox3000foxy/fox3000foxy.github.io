import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";
function groupByYearMonth(articles, locale) {
    const map = new Map();
    for (const a of articles) {
        if (!a.date) {
            continue;
        }
        const d = new Date(`${a.date}T00:00:00`);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(a);
    }
    const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    return sorted.map(([key, arts]) => {
        const [year, month] = key.split("-");
        const label = new Date(Number(year), Number(month) - 1).toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
        });
        return { label, articles: arts };
    });
}
export default function Archive() {
    const { t, lang } = useLang();
    const [groups, setGroups] = useState([]);
    useEffect(() => {
        const indexUrl = `/articles/${lang}/index.json`;
        const fallbackUrl = lang === "en" ? null : "/articles/en/index.json";
        async function load() {
            let res = await fetch(cacheBust(indexUrl));
            if (!res.ok && fallbackUrl) {
                res = await fetch(cacheBust(fallbackUrl));
            }
            if (!res.ok) {
                setGroups([]);
                return;
            }
            const data = await res.json();
            if (Array.isArray(data)) {
                // biome-ignore lint/suspicious/noExplicitAny: legacy string format
                const normalized = data.map((item) => typeof item === "string" ? { slug: item } : item);
                setGroups(groupByYearMonth(normalized, lang));
            }
        }
        void load();
    }, [lang]);
    if (groups.length === 0) {
        return _jsx("p", { children: t("archive.loading") });
    }
    return (_jsxs("div", { className: "archive", children: [_jsx("h2", { children: t("archive.title") }), groups.map((group) => (_jsxs("section", { className: "archive-group", children: [_jsx("h3", { className: "archive-month", children: group.label }), _jsx("ul", { className: "archive-list", children: group.articles.map((a) => (_jsxs("li", { className: "archive-item", children: [_jsx("time", { className: "archive-day", dateTime: a.date, children: a.date ? new Date(`${a.date}T00:00:00`).getDate() : "??" }), _jsx(Link, { to: `/blog/${a.slug}`, className: "archive-link", children: a.title ?? a.slug.replace(/-/g, " ") })] }, a.slug))) })] }, group.label)))] }));
}
