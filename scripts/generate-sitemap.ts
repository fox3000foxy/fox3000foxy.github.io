import * as fs from "node:fs";
import * as path from "node:path";

const SITE_URL = "https://fox3000foxy.com";
const ARTICLES_DIR = "public/articles";
const OUTPUT = "dist/sitemap.xml";

interface ArticleMeta {
	slug: string;
	date?: string;
}

function main() {
	const root = process.cwd();

	const entries: { loc: string; priority: string; lastmod?: string }[] = [
		{ loc: "/", priority: "1.0" },
		{ loc: "/blog", priority: "0.9" },
		{ loc: "/archive", priority: "0.7" },
		{ loc: "/projects", priority: "0.8" },
		{ loc: "/portfolio", priority: "0.7" },
	];

	const langs = fs.readdirSync(path.join(root, ARTICLES_DIR), { withFileTypes: true });
	for (const entry of langs) {
		if (!entry.isDirectory()) { continue; }
		const indexPath = path.join(root, ARTICLES_DIR, entry.name, "index.json");
		if (!fs.existsSync(indexPath)) { continue; }
		const articles: ArticleMeta[] = JSON.parse(fs.readFileSync(indexPath, "utf8"));
		if (!Array.isArray(articles)) { continue; }
		for (const a of articles) {
			entries.push({
				loc: `/blog/${encodeURIComponent(a.slug)}`,
				priority: "0.6",
				lastmod: a.date || undefined,
			});
		}
	}

	const urlTags = entries
		.map(
			(p) => `  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    ${p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>\n    ` : ""}<priority>${p.priority}</priority>
  </url>`
		)
		.join("\n");

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlTags}
</urlset>`;

	const outPath = path.join(root, OUTPUT);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, sitemap);
	console.log(`Sitemap generated: ${OUTPUT} (${entries.length} URLs)`);
}

main();
