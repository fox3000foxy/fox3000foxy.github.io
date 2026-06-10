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
	date?: string;
	tags?: string[];
}

function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapText(text: string, maxLen: number): string[] {
	const lines: string[] = [];
	const words = text.split(" ");
	let line = "";
	for (const word of words) {
		if ((line + " " + word).length > maxLen) {
			lines.push(line);
			line = word;
		} else {
			line = (line ? line + " " : "") + word;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function ogImageSvg(title: string, description: string, tags: string[]): string {
	const titleLines = wrapText(title, 35);
	if (titleLines.length > 3) {
		titleLines.splice(2, titleLines.length - 2, "...");
	}

	const descLines = wrapText(description, 80);
	if (descLines.length > 2) {
		descLines.splice(1, descLines.length - 1, "...");
	}

	const titleStartY = 270;
	const titleElements = titleLines
		.map((l, i) => `<text x="600" y="${titleStartY + i * 55}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="700" fill="#ffffff">${escapeXml(l)}</text>`)
		.join("\n");

	const descY = titleStartY + Math.min(titleLines.length, 3) * 55 + 25;
	const descElements = descLines
		.map((l, i) => `<text x="600" y="${descY + i * 28}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#8b949e">${escapeXml(l)}</text>`)
		.join("\n");

	const tagY = descY + Math.min(descLines.length, 2) * 28 + 30;
	const tagElements = tags.slice(0, 5).map((t, i) => {
		const cx = 600 + (i - Math.min(tags.length, 5) / 2) * 110 + 55;
		return `<rect x="${cx - 48}" y="${tagY - 14}" width="96" height="28" rx="14" fill="#21262d" stroke="#30363d" stroke-width="1"/>
  <text x="${cx}" y="${tagY + 5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#64b5f6">${escapeXml(t)}</text>`;
	}).join("\n");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d1117"/>
  <rect x="0" y="0" width="1200" height="4" fill="#64b5f6"/>
  <text x="600" y="180" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="#64b5f6" letter-spacing="4">FOX3000FOXY.COM</text>
  <rect x="540" y="195" width="120" height="1" fill="#30363d"/>
${titleElements}
${descElements}
${tagElements}
  <text x="600" y="600" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#8b949e">fox3000foxy · Blog</text>
</svg>`;
}

function main() {
	const root = process.cwd();

	const baseHtml = fs.readFileSync(path.join(root, DIST_INDEX), "utf8");
	let count = 0;

	const langs = fs.readdirSync(path.join(root, ARTICLES_DIR), { withFileTypes: true });
	const bySlug = new Map<string, { slug: string; title: string; description: string; date?: string; tags: string[]; langs: string[] }>();
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
				bySlug.set(slug, { slug, title: article.title || slug.replace(/-/g, " "), description: article.description || "", tags: [], langs: [] });
			}
			const entry = bySlug.get(slug)!;
			if (lang === "en") {
				entry.title = article.title || entry.title;
				entry.description = article.description || entry.description;
				if (article.tags) entry.tags = article.tags;
			}
			entry.langs.push(lang);
			if (lang === "en" && article.date) {
				entry.date = article.date;
			}
		}
	}

	const ogDir = path.join(root, "dist", "og");
	fs.mkdirSync(ogDir, { recursive: true });
	let rendered = 0;
	let skipped = 0;

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
			datePublished: info.date || undefined,
			dateModified: info.date || undefined,
			author: { "@type": "Person", name: "Fox3000foxy", url: "https://github.com/fox3000foxy" },
			publisher: {
				"@type": "Organization",
				name: "Fox's Blog",
				logo: { "@type": "ImageObject", url: "https://fox3000foxy.com/icons/apple-icon-180x180.png" },
			},
			image: `${SITE_URL}/og/${encodeURIComponent(slug)}.png`,
			url,
			isAccessibleForFree: true,
			mainEntityOfPage: { "@type": "WebPage", "@id": url },
		});

		const ogImageUrl = `${SITE_URL}/og/${encodeURIComponent(slug)}.png`;
		const svgContent = ogImageSvg(info.title, info.description, info.tags);

		const pngPath = path.join(ogDir, `${slug}.png`);
		if (!fs.existsSync(pngPath)) {
			const pngBuffer = new Resvg(svgContent, { fitTo: { mode: "original" } }).render().asPng();
			fs.writeFileSync(pngPath, pngBuffer);
			rendered++;
		} else {
			skipped++;
		}
		fs.writeFileSync(path.join(ogDir, `${slug}.svg`), svgContent);

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
			.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(info.title)} | Fox's Blog</title>`)
			.replace(
				"</head>",
				`<link rel="canonical" href="${escapeXml(url)}" />\n${hreflangTags}\n<meta name="twitter:card" content="summary_large_image" />\n<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />\n<link rel="webmention" href="https://webmention.io/fox3000foxy/webmention" />\n<link rel="pingback" href="https://webmention.io/fox3000foxy/xmlrpc" />\n<link rel="authorization_endpoint" href="https://indieauth.com/auth" />\n<link rel="token_endpoint" href="https://tokens.indieauth.com/token" />\n<link rel="me" href="https://github.com/fox3000foxy" />\n<script type="application/ld+json">${jsonLd}</script>\n</head>`
			);

		const outDir = path.join(root, "dist", "blog", slug);
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, "index.html"), html);
		count++;
	}
	console.log(`Generated ${count} pages (${rendered} PNGs rendered, ${skipped} cached)`);
}

main();
