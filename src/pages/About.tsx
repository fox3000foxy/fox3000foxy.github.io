import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../hooks/useLang";

export default function About() {
	const { t, lang } = useLang();
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		const url = `/about${lang === "en" ? "" : `.${lang}`}.md`;
		fetch(url)
			.then((r) => {
				if (!r.ok) {
					throw new Error("fetch failed");
				}
				return r.text();
			})
			.then(setContent)
			.catch(() => {
				// fallback to English
				fetch("/about.md")
					.then((r) => (r.ok ? r.text() : Promise.reject()))
					.then(setContent)
					.catch(() => setError(true));
			});
	}, [lang]);

	if (error) {
		return <p>{t("about.error")}</p>;
	}

	if (!content) {
		return <p>{t("about.loading")}</p>;
	}

	return (
		<div className="about-page">
			<div
				// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted markdown rendered as static content
				dangerouslySetInnerHTML={{
					__html: content
						.replace(/^#\s+(.+)/m, "<h1>$1</h1>")
						.replace(/^##\s+(.+)/gm, "<h2>$1</h2>")
						.replace(/^###\s+(.+)/gm, "<h3>$1</h3>")
						.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
						.replace(/\*(.+?)\*/g, "<em>$1</em>")
						.replace(/^- (.+)/gm, "<li>$1</li>")
						.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
						.replace(
							/\[(.+?)\]\((.+?)\)/g,
							'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
						)
						.replace(/\n\n/g, "</p><p>")
						.replace(/^(.+)$/m, "<p>$1</p>")
						.replace(/(?:\r?\n){2,}/g, "\n"),
				}}
			/>
			<Link to="/" className="back-home">
				← {t("notFound.return")}
			</Link>
		</div>
	);
}
