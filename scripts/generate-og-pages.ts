// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const SITE_URL = "https://fox3000foxy.com";
const ARTICLES_DIR = "public/articles";
const DIST_INDEX = "dist/index.html";

interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
}

function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ogImageSvg(title: string, slug: string): string {
	const lines: string[] = [];
	const words = title.split(" ");
	let line = "";
	for (const word of words) {
		if ((line + " " + word).length > 35) {
			lines.push(line);
			line = word;
		} else {
			line = (line ? line + " " : "") + word;
		}
	}
	if (line) lines.push(line);
	if (lines.length > 4) {
		lines.splice(3, lines.length - 3, "...");
	}

	const textY = lines.map((_, i) => 340 + i * 55);
	const textElements = lines
		.map((l, i) => `<text x="600" y="${textY[i]}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="700" fill="#ffffff">${escapeXml(l)}</text>`)
		.join("\n");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d1117"/>
  <rect x="0" y="0" width="1200" height="4" fill="#64b5f6"/>
  <text x="600" y="200" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="#64b5f6" letter-spacing="4">FOX3000FOXY.COM</text>
  <rect x="540" y="215" width="120" height="1" fill="#30363d"/>
${textElements}
  <text x="600" y="520" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#8b949e">fox3000foxy · Blog</text>
</svg>`;
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

		const ogImageUrl = `${SITE_URL}/og/${encodeURIComponent(slug)}.png`;
		const svgContent = ogImageSvg(info.title, slug);
		const pngBuffer = new Resvg(svgContent, { fitTo: { mode: "original" } }).render().asPng();
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
			.replace(
				/<meta property="og:image" content="[^"]*" \/>/,
				`<meta property="og:image" content="${escapeXml(ogImageUrl)}" />`
			)
			.replace(
				/<meta property="og:image:width" content="[^"]*" \/>/,
				'<meta property="og:image:width" content="1200" />'
			)
			.replace(
				/<meta property="og:image:height" content="[^"]*" \/>/
			,
				'<meta property="og:image:height" content="630" />'
			)
			.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(info.title)} | Fox's Blog</title>`)
			.replace(
				"</head>",
				`<link rel="canonical" href="${escapeXml(url)}" />\n${hreflangTags}\n<script type="application/ld+json">${jsonLd}</script>\n</head>`
			);

		const ogDir = path.join(root, "dist", "og");
		fs.mkdirSync(ogDir, { recursive: true });
		fs.writeFileSync(path.join(ogDir, `${slug}.svg`), svgContent);
		fs.writeFileSync(path.join(ogDir, `${slug}.png`), pngBuffer);

		const outDir = path.join(root, "dist", "blog", slug);
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, "index.html"), html);
		count++;
	}
	console.log(`OG pages generated for ${count} articles`);
}

main();
