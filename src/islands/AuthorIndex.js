import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/BlogList.css";
import { cacheBust } from "../utils/cacheBust";
import { useLang } from "../hooks/useLang";
import BlogCard from "../components/BlogCard";
import { getAuthors } from "../utils/authors";
export default function AuthorIndex() {
    const { id } = useParams();
    const { t, lang } = useLang();
    const navigate = useNavigate();
    const [articles, setArticles] = useState([]);
    useEffect(() => {
        if (!id) {
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
                    .filter((a) => !a.authors || a.authors.includes(id))
                    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
                setArticles(filtered);
            }
        }
        void load();
    }, [id, lang]);
    const author = id ? getAuthors([id])[0] : null;
    return (_jsxs("div", { className: "blog-list", children: [_jsxs("div", { className: "tag-page-header", children: [_jsxs("button", { type: "button", className: "tag-page-back", onClick: () => {
                            if (window.history.length > 1) {
                                void navigate(-1);
                            }
                            else {
                                void navigate("/blog");
                            }
                        }, children: ["\u2190 ", t("blog.title")] }), _jsxs("div", { className: "author-page-title", children: [author && (_jsx("img", { className: "author-page-avatar", src: author.avatar ?? `https://github.com/${author.id}.png`, alt: author.name })), _jsx("h2", { children: author?.name ?? id })] })] }), articles.length > 0 ? (_jsx("div", { className: "blog-grid", children: articles.map((article) => (_jsx(BlogCard, { article: article }, article.slug))) })) : (_jsx("p", { children: t("notFound.article", { slug: id || "" }) }))] }));
}
