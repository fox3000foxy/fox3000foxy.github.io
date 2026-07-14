import { jsx as _jsx } from "react/jsx-runtime";
import { useLang } from "../hooks/useLang";
import MarkdownContent from "../components/MarkdownContent";
import { useMarkdown } from "../hooks/useMarkdown";
export default function Uses() {
    const { t, lang } = useLang();
    const url = lang === "en" ? "/uses.md" : `/uses.${lang}.md`;
    const fallbackUrl = lang === "en" ? undefined : "/uses.md";
    const { content, error } = useMarkdown(url, `uses:${lang}`, fallbackUrl);
    if (error) {
        return _jsx("p", { children: t("uses.error") });
    }
    if (content === null) {
        return _jsx("p", { children: t("uses.loading") });
    }
    return (_jsx("article", { children: _jsx(MarkdownContent, { content: content }) }));
}
