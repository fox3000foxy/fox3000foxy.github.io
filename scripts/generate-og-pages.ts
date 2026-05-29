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
	const seen = new Set<string>();
	for (const entry of langs) {
		if (!entry.isDirectory()) { continue; }
		const indexPath = path.join(root, ARTICLES_DIR, entry.name, "index.json");
		if (!fs.existsSync(indexPath)) { continue; }
		const articles: ArticleMeta[] = JSON.parse(fs.readFileSync(indexPath, "utf8"));
		if (!Array.isArray(articles)) { continue; }

		for (const article of articles) {
			const slug = article.slug;
			if (seen.has(slug)) { continue; }
			seen.add(slug);

			const title = article.title || slug.replace(/-/g, " ");
			const description = article.description || "";
			const url = `${SITE_URL}/blog/${encodeURIComponent(slug)}`;

			const html = baseHtml
				.replace(
					/<meta property="og:title" content="[^"]*" \/>/,
					`<meta property="og:title" content="${escapeXml(title)}" />`
				)
				.replace(
					/<meta property="og:description" content="[^"]*" \/>/,
					`<meta property="og:description" content="${escapeXml(description)}" />`
				)
				.replace(
					/<meta property="og:url" content="[^"]*" \/>/,
					`<meta property="og:url" content="${escapeXml(url)}" />`
				)
				.replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(title)} | Fox's Blog</title>`);

			const outDir = path.join(root, "dist", "blog", slug);
			fs.mkdirSync(outDir, { recursive: true });
			fs.writeFileSync(path.join(outDir, "index.html"), html);
			count++;
		}
	}

	console.log(`OG pages generated for ${count} articles`);
}

main();
