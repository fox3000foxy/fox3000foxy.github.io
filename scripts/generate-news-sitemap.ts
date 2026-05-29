// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";

const SITE_URL = "https://fox3000foxy.com";
const ARTICLES_DIR = "public/articles";
const OUTPUT = "dist/news-sitemap.xml";

interface ArticleMeta {
	slug: string;
	title?: string;
	date?: string;
}

function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function main() {
	const root = process.cwd();
	const seen = new Map<string, { title: string; date: string }>();

	const langs = fs.readdirSync(path.join(root, ARTICLES_DIR), { withFileTypes: true });
	for (const entry of langs) {
		if (!entry.isDirectory()) { continue; }
		const lang = entry.name;
		const indexPath = path.join(root, ARTICLES_DIR, lang, "index.json");
		if (!fs.existsSync(indexPath)) { continue; }
		const articles: ArticleMeta[] = JSON.parse(fs.readFileSync(indexPath, "utf8"));
		if (!Array.isArray(articles)) { continue; }
		for (const a of articles) {
			if (!a.date || !a.title) { continue; }
			if (!seen.has(a.slug) || lang === "en") {
				seen.set(a.slug, { title: a.title, date: a.date });
			}
		}
	}

	const urlTags: string[] = [];
	for (const [slug, info] of seen) {
		urlTags.push(`  <url>
    <loc>${SITE_URL}/blog/${encodeURIComponent(slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>Fox's Blog</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${info.date}</news:publication_date>
      <news:title>${escapeXml(info.title)}</news:title>
    </news:news>
  </url>`);
	}

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlTags.join("\n")}
</urlset>`;

	const outPath = path.join(root, OUTPUT);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, sitemap);
	console.log(`Google News sitemap generated: ${OUTPUT} (${seen.size} articles)`);
}

main();
