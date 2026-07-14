import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "../styles/Home.css";
import { useLang } from "../hooks/useLang";
import LazyVisible from "../components/LazyVisible";
import MarkdownContent from "../components/MarkdownContent";
import GitHubActivity from "../components/GitHubActivity";
import NewsletterSignup from "../components/NewsletterSignup";
import RssSubscribe from "../components/RssSubscribe";
import { useMarkdown } from "../hooks/useMarkdown";
export default function Home() {
    const { t, lang } = useLang();
    const url = lang === "en" ? "/home.md" : `/home.${lang}.md`;
    const fallbackUrl = lang === "en" ? undefined : "/home.md";
    const { content, error } = useMarkdown(url, `home:${lang}`, fallbackUrl);
    if (error) {
        return _jsx("p", { children: t("home.error") });
    }
    if (content === null) {
        return (_jsxs("article", { className: "home home-skeleton", children: [_jsx("div", { className: "skeleton-title" }), _jsx("div", { className: "skeleton-line" }), _jsx("div", { className: "skeleton-line" }), _jsx("div", { className: "skeleton-line skeleton-line--short" })] }));
    }
    return (_jsxs("article", { className: "home", children: [_jsx(MarkdownContent, { content: content }), _jsx(RssSubscribe, {}), _jsx(LazyVisible, { height: "270px", children: _jsx(GitHubActivity, {}) }), _jsx(LazyVisible, { height: "220px", children: _jsx(NewsletterSignup, {}) })] }));
}
