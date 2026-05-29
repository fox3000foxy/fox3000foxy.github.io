// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";

const SITE_URL = "https://fox3000foxy.com";
const ARTICLES_DIR = "public/articles";
const DIST_INDEX = "dist/index.html";

interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
}

function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function main() {
	const root = process.cwd();

	const baseHtml = fs.readFileSync(path.join(root, DIST_INDEX), "utf8");
	let count = 0;

	const langs = fs.readdirSync(path.join(root, ARTICLES_DIR), { withFileTypes: true });
	const bySlug = new Map<string, { slug: string; title: string; description: string; langs: string[] }>();
	for (const entry of langs) {
		if (!entry.isDirectory()) { continue; }
		const lang = entry.name;
		const indexPath = path.join(root, ARTICLES_DIR, lang, "index.json");
		if (!fs.existsSync(indexPath)) { continue; }
		const articles: ArticleMeta[] = JSON.parse(fs.readFileSync(indexPath, "utf8"));
		if (!Array.isArray(articles)) { continue; }

		for (const article of articles) {
			const slug = article.slug;
			if (!bySlug.has(slug)) {
				bySlug.set(slug, { slug, title: article.title || slug.replace(/-/g, " "), description: article.description || "", langs: [] });
			}
			const entry = bySlug.get(slug)!;
			if (lang === "en") {
				entry.title = article.title || entry.title;
				entry.description = article.description || entry.description;
			}
			entry.langs.push(lang);
		}
	}

	for (const [slug, info] of bySlug) {
		const url = `${SITE_URL}/blog/${encodeURIComponent(slug)}`;

		const hreflangTags = info.langs
			.map((l) => `<link rel="alternate" hreflang="${l}" href="${url}?lang=${l}" />`)
			.join("\n");

		const jsonLd = JSON.stringify({
			"@context": "https://schema.org",
			"@type": "Article",
			headline: info.title,
			description: info.description,
			author: { "@type": "Person", name: "Fox3000foxy", url: "https://github.com/fox3000foxy" },
			url,
			isAccessibleForFree: true,
			mainEntityOfPage: { "@type": "WebPage", "@id": url },
		});

		const html = baseHtml
			.replace(
				/<meta property="og:title" content="[^"]*" \/>/,
				`<meta property="og:title" content="${escapeXml(info.title)}" />`
			)
			.replace(
				/<meta property="og:description" content="[^"]*" \/>/,
				`<meta property="og:description" content="${escapeXml(info.description)}" />`
			)
			.replace(
				/<meta property="og:url" content="[^"]*" \/>/,
				`<meta property="og:url" content="${escapeXml(url)}" />`
			)
			.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(info.title)} | Fox's Blog</title>`)
			.replace(
				"</head>",
				`<link rel="canonical" href="${escapeXml(url)}" />\n${hreflangTags}\n<script type="application/ld+json">${jsonLd}</script>\n</head>`
			);

		const outDir = path.join(root, "dist", "blog", slug);
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, "index.html"), html);
		count++;
	}
	console.log(`OG pages generated for ${count} articles`);
}

main();
