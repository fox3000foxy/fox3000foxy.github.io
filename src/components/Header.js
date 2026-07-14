import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import { useTheme } from "../hooks/useTheme";
import { ALL_LANGS } from "../i18n/types";
import "./Header.css";
const LANG_LABELS = {
    en: "English",
    fr: "Français",
    zh: "中文",
    ja: "日本語",
    ko: "한국어",
    tr: "Türkçe",
    it: "Italiano",
    de: "Deutsch",
    ru: "Русский",
    es: "Español",
    pt: "Português",
    id: "Indonesia",
    hi: "हिन्दी",
    ar: "العربية",
    vi: "Tiếng Việt",
    th: "ไทย",
};
export default function Header() {
    const { t, lang, setLang } = useLang();
    const { theme, toggleTheme } = useTheme();
    const [menuOpen, setMenuOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    function closeMenu() {
        setMenuOpen(false);
        setMoreOpen(false);
    }
    return (_jsx("header", { children: _jsxs("div", { className: "container", children: [_jsx(Link, { to: "/", children: _jsx("img", { className: "avatar", src: "https://github.com/fox3000foxy.png", alt: "GitHub avatar", width: "40", height: "40" }) }), _jsx("h1", { className: "site-title", children: _jsx(Link, { to: "/", className: "title-link", children: t("site.title") }) }), _jsxs("button", { type: "button", className: `hamburger${menuOpen ? " open" : ""}`, onClick: () => setMenuOpen(!menuOpen), "aria-label": "Toggle menu", children: [_jsx("span", {}), _jsx("span", {}), _jsx("span", {})] }), _jsxs("nav", { className: menuOpen ? "open" : "", children: [_jsx(Link, { to: "/", onClick: closeMenu, children: t("nav.home") }), _jsx(Link, { to: "/blog", onClick: closeMenu, children: t("nav.blog") }), _jsx(Link, { to: "/about", onClick: closeMenu, children: t("nav.about") }), _jsx(Link, { to: "/projects", onClick: closeMenu, children: t("nav.projects") }), _jsx(Link, { to: "/write", onClick: closeMenu, children: t("nav.write") }), _jsx(Link, { to: "/search", onClick: closeMenu, children: t("nav.search") }), _jsxs("div", { className: `nav-dropdown${moreOpen || menuOpen ? " open" : ""}`, children: [_jsx("span", { className: "nav-dropdown-toggle", role: "button", tabIndex: 0, onClick: () => setMoreOpen(!moreOpen), onKeyDown: (e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            setMoreOpen(!moreOpen);
                                        }
                                    }, children: t("nav.more") }), _jsxs("div", { className: "nav-dropdown-menu", children: [_jsx(Link, { to: "/tags", onClick: closeMenu, children: t("nav.tags") }), _jsx(Link, { to: "/archive", onClick: closeMenu, children: t("nav.archive") }), _jsx(Link, { to: "/photos", onClick: closeMenu, children: t("nav.photos") }), _jsx(Link, { to: "/uses", onClick: closeMenu, children: t("nav.uses") }), _jsx(Link, { to: "/contact", onClick: closeMenu, children: t("nav.contact") }), _jsx(Link, { to: "/legacy", onClick: closeMenu, children: t("nav.portfolio") })] })] }), _jsx("select", { className: "lang-select", value: lang, onChange: (e) => setLang(e.target.value), children: ALL_LANGS.map((l) => (_jsx("option", { value: l, children: LANG_LABELS[l] }, l))) }), _jsx("button", { type: "button", className: "theme-toggle", onClick: () => {
                                toggleTheme();
                                closeMenu();
                            }, "aria-label": `Switch to ${theme === "dark" ? "light" : "dark"} mode`, children: theme === "dark" ? "☀️" : "🌙" })] })] }) }));
}
