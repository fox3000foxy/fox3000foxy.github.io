import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import NotFound from "./NotFound";
export default function Project() {
    const { slug } = useParams();
    const { t } = useLang();
    const [content, setContent] = useState(null);
    const [repo, setRepo] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (!slug) {
            return;
        }
        fetch(`https://api.github.com/repos/fox3000foxy/${encodeURIComponent(slug)}`)
            .then((res) => {
            if (!res.ok) {
                throw new Error("Not found");
            }
            return res.json();
        })
            .then((data) => {
            setRepo(data);
            return fetch(`https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(slug)}/${data.default_branch}/README.md`);
        })
            .then((res) => {
            if (!res.ok) {
                setContent("");
                return;
            }
            return res.text().then((text) => setContent(text));
        })
            .catch(() => setError(true));
    }, [slug]);
    if (error) {
        return _jsx(NotFound, { message: t("notFound.project", { slug: slug || "" }) });
    }
    if (content === null) {
        return _jsx("p", { children: t("project.error") });
    }
    return (_jsxs("article", { children: [_jsx("p", { className: "project-back", children: _jsx(Link, { to: "/projects", children: t("project.back") }) }), repo && (_jsxs("div", { className: "project-header-meta", children: [repo.description && (_jsx("p", { className: "article-description", children: repo.description })), _jsxs("p", { className: "project-meta-links", children: [_jsx("a", { href: repo.html_url, target: "_blank", rel: "noopener noreferrer", children: t("project.viewOnGh") }), repo.language && (_jsx("span", { className: "project-meta-lang", children: repo.language })), repo.stargazers_count > 0 && (_jsxs("span", { children: ["\u2B50 ", repo.stargazers_count] }))] })] })), _jsx(MarkdownContent, { content: content || t("project.noReadme"), urlTransform: (url) => {
                    if (repo &&
                        url &&
                        !url.startsWith("http") &&
                        !url.startsWith("#") &&
                        !url.startsWith("mailto:")) {
                        return `https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(slug)}/${repo.default_branch}/${url}`;
                    }
                    return url;
                } })] }));
}
