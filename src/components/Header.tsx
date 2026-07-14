import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import { useTheme } from "../hooks/useTheme";
import type { Lang } from "../i18n/types";
import { ALL_LANGS } from "../i18n/types";
import "./Header.css";

const LANG_LABELS: Record<Lang, string> = {
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

	return (
		<header>
			<div className="container">
				<Link to="/">
					<img
						className="avatar"
						src="https://github.com/fox3000foxy.png"
						alt="GitHub avatar"
						width="40"
						height="40"
					/>
				</Link>
				<h1 className="site-title">
					<Link to="/" className="title-link">
						{t("site.title")}
					</Link>
				</h1>
				<button
					type="button"
					className={`hamburger${menuOpen ? " open" : ""}`}
					onClick={() => setMenuOpen(!menuOpen)}
					aria-label="Toggle menu"
				>
					<span />
					<span />
					<span />
				</button>
				<nav className={menuOpen ? "open" : ""}>
					<Link to="/" onClick={closeMenu}>
						{t("nav.home")}
					</Link>
					<Link to="/blog" onClick={closeMenu}>
						{t("nav.blog")}
					</Link>
					<Link to="/about" onClick={closeMenu}>
						{t("nav.about")}
					</Link>
					<Link to="/projects" onClick={closeMenu}>
						{t("nav.projects")}
					</Link>
					<Link to="/write" onClick={closeMenu}>
						{t("nav.write")}
					</Link>
					<Link to="/search" onClick={closeMenu}>
						{t("nav.search")}
					</Link>
					<div className={`nav-dropdown${moreOpen || menuOpen ? " open" : ""}`}>
						{/** biome-ignore lint/a11y/useSemanticElements: biome lint error */}
						<span
							className="nav-dropdown-toggle"
							role="button"
							tabIndex={0}
							onClick={() => setMoreOpen(!moreOpen)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									setMoreOpen(!moreOpen);
								}
							}}
						>
							{t("nav.more")}
						</span>
						<div className="nav-dropdown-menu">
							<Link to="/tags" onClick={closeMenu}>
								{t("nav.tags")}
							</Link>
							<Link to="/archive" onClick={closeMenu}>
								{t("nav.archive")}
							</Link>
							<Link to="/photos" onClick={closeMenu}>
								{t("nav.photos")}
							</Link>
							<Link to="/uses" onClick={closeMenu}>
								{t("nav.uses")}
							</Link>
							<Link to="/contact" onClick={closeMenu}>
								{t("nav.contact")}
							</Link>
							<Link to="/legacy" onClick={closeMenu}>
								{t("nav.portfolio")}
							</Link>
						</div>
					</div>
					<select
						className="lang-select"
						value={lang}
						onChange={(e) => setLang(e.target.value as Lang)}
					>
						{ALL_LANGS.map((l) => (
							<option key={l} value={l}>
								{LANG_LABELS[l]}
							</option>
						))}
					</select>
					<button
						type="button"
						className="theme-toggle"
						onClick={() => {
							toggleTheme();
							closeMenu();
						}}
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
					>
						{theme === "dark" ? "☀️" : "🌙"}
					</button>
				</nav>
			</div>
		</header>
	);
}
