import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";
export default function About() {
    const { t, lang } = useLang();
    const [content, setContent] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const url = `/about${lang === "en" ? "" : `.${lang}`}.md`;
        fetch(url)
            .then((r) => {
            if (!r.ok) {
                throw new Error("fetch failed");
            }
            return r.text();
        })
            .then((text) => {
            if (!cancelled) {
                setContent(text);
            }
        })
            .catch(() => {
            if (cancelled) {
                return;
            }
            // fallback to English
            fetch("/about.md")
                .then((r) => (r.ok ? r.text() : Promise.reject()))
                .then((text) => {
                if (!cancelled) {
                    setContent(text);
                }
            })
                .catch(() => {
                if (!cancelled) {
                    setError(true);
                }
            });
        });
        return () => {
            cancelled = true;
        };
    }, [lang]);
    const html = useMemo(() => (content ?? "")
        .replace(/^#\s+(.+)/m, "<h1>$1</h1>")
        .replace(/^##\s+(.+)/gm, "<h2>$1</h2>")
        .replace(/^###\s+(.+)/gm, "<h3>$1</h3>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/^- (.+)/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n\n/g, "</p><p>")
        .replace(/^(.+)$/m, "<p>$1</p>")
        .replace(/(?:\r?\n){2,}/g, "\n"), [content]);
    if (error) {
        return _jsx("p", { children: t("about.error") });
    }
    if (!content) {
        return _jsx("p", { children: t("about.loading") });
    }
    return (_jsxs("div", { className: "about-page", children: [_jsx("div", { 
                // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted markdown rendered as static content
                dangerouslySetInnerHTML: { __html: html } }), _jsxs(Link, { to: "/", className: "back-home", children: ["\u2190 ", t("notFound.return")] })] }));
}
