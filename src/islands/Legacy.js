import { jsx as _jsx } from "react/jsx-runtime";
import "../styles/Home.css";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";
export default function Legacy() {
    const { t } = useLang();
    const { content, error } = useMarkdown("/legacy.md", "legacy");
    if (error) {
        return _jsx("p", { children: t("portfolio.error") });
    }
    if (content === null) {
        return _jsx("p", { children: t("portfolio.loading") });
    }
    return (_jsx("article", { className: "home", children: _jsx(MarkdownContent, { content: content }) }));
}
