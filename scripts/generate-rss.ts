import * as fs from "node:fs";
import * as path from "node:path";

import * as fs from "node:fs";
import * as path from "node:path";

const SITE_URL = "https://fox3000foxy.com";
const ARTICLES_DIR = "public/articles";
const OUTPUT = "dist/feed.xml";

interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
	date?: string;
	tags?: string[];
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function toRssDate(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toUTCString();
}

interface LangArticles {
	lang: string;
	articles: ArticleMeta[];
}

function loadAllLanguages(root: string): LangArticles[] {
	const langs: LangArticles[] = [];
	const entries = fs.readdirSync(path.join(root, ARTICLES_DIR), { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) { continue; }
		const indexPath = path.join(root, ARTICLES_DIR, entry.name, "index.json");
		if (!fs.existsSync(indexPath)) { continue; }
		const raw = fs.readFileSync(indexPath, "utf8");
		const articles: ArticleMeta[] = JSON.parse(raw);
		if (Array.isArray(articles)) {
			langs.push({ lang: entry.name, articles });
		}
	}
	return langs;
}

function main() {
	const root = process.cwd();
	const allLangs = loadAllLanguages(root);

	const items: string[] = [];
	for (const { lang, articles } of allLangs) {
		const sorted = [...articles].sort(
			(a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
		);
		for (const article of sorted) {
			const slug = article.slug;
			const link = `${SITE_URL}/blog/${encodeURIComponent(slug)}`;
			const pubDate = article.date ? toRssDate(article.date) : "";
			const tags = article.tags || [];
			const title = article.title || slug;

			items.push(`
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(article.description || "")}</description>
      <pubDate>${pubDate}</pubDate>
      ${tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
    </item>`);
		}
	}

	const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Fox's Blog</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Fox3000foxy's blog about web development, automation, and open-source</description>
    <language>en</language>
    <lastBuildDate>${toRssDate(new Date().toISOString().split("T")[0])}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    ${items.join("\n")}
  </channel>
</rss>`;

	const outPath = path.join(root, OUTPUT);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, feed);
	console.log(`RSS feed generated: ${OUTPUT} (${items.length} items across ${allLangs.length} languages)`);
}

main();
