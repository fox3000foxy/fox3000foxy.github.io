import { Link } from "react-router-dom";
import "./Header.css";
import { useLang } from "../hooks/useLang";

export default function Header() {
	const { t, lang, setLang } = useLang();

	return (
		<header>
			<div className="container">
				<Link to="/">
					<img
						className="avatar"
						src="https://github.com/fox3000foxy.png"
						alt="GitHub avatar"
					/>
				</Link>
				<h1 className="site-title">
					<Link to="/" className="title-link">
						{t("site.title")}
					</Link>
				</h1>
				<nav>
					<Link to="/">{t("nav.home")}</Link>
					<Link to="/blog">{t("nav.blog")}</Link>
					<Link to="/archive">{t("nav.archive")}</Link>
					<Link to="/projects">{t("nav.projects")}</Link>
					<Link to="/portfolio">{t("nav.portfolio")}</Link>
					<span className="lang-switcher">
						<button
							type="button"
							className={`lang-btn${lang === "fr" ? " active" : ""}`}
							onClick={() => setLang("fr")}
						>
							FR
						</button>
						<span className="lang-sep">/</span>
						<button
							type="button"
							className={`lang-btn${lang === "en" ? " active" : ""}`}
							onClick={() => setLang("en")}
						>
							EN
						</button>
					</span>
				</nav>
			</div>
		</header>
	);
}
