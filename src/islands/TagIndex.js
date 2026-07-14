import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/BlogList.css";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";
import BlogCard from "../components/BlogCard";
export default function TagIndex() {
    const { tag } = useParams();
    const { t, lang } = useLang();
    const navigate = useNavigate();
    const [articles, setArticles] = useState([]);
    useEffect(() => {
        if (!tag) {
            return;
        }
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
                // biome-ignore lint/suspicious/noExplicitAny: legacy string format
                const normalized = data.map(
                // biome-ignore lint/suspicious/noExplicitAny: legacy string format
                (item) => (typeof item === "string" ? { slug: item } : item));
                const filtered = normalized
                    .filter((a) => a.tags?.includes(tag))
                    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
                setArticles(filtered);
            }
        }
        void load();
    }, [tag, lang]);
    return (_jsxs("div", { className: "blog-list", children: [_jsxs("div", { className: "tag-page-header", children: [_jsxs("button", { type: "button", className: "tag-page-back", onClick: () => {
                            if (window.history.length > 1) {
                                void navigate(-1);
                            }
                            else {
                                void navigate("/blog");
                            }
                        }, children: ["\u2190 ", t("blog.title")] }), _jsxs("h2", { children: ["#", tag] })] }), articles.length > 0 ? (_jsx("div", { className: "blog-grid", children: articles.map((article) => (_jsx(BlogCard, { article: article }, article.slug))) })) : (_jsx("p", { children: t("blog.no.tag", { tag: tag || "" }) }))] }));
}
