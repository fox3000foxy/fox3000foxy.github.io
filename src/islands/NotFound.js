import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";
export default function NotFound({ message }) {
    const { t } = useLang();
    const { content } = useMarkdown("/404.md", "404");
    if (content === null) {
        return _jsx("p", { children: t("notFound.loading") });
    }
    if (content) {
        return (_jsx("article", { children: _jsx(MarkdownContent, { content: content }) }));
    }
    return (_jsxs("div", { children: [_jsx("h2", { children: "404" }), _jsx("p", { children: message || t("notFound.title") }), _jsx("p", { children: _jsx(Link, { to: "/", children: t("notFound.return") }) })] }));
}
