import * as fs from "node:fs";
import * as path from "node:path";

const SITE_URL = "https://fox3000foxy.com";
const ARTICLES_DIR = "public/articles";
const OUTPUT_DIR = "dist";

interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
	date?: string;
	tags?: string[];
}

const LANG_META: Record<string, { title: string; description: string }> = {
	en: {
		title: "Fox's Blog",
		description: "Fox3000foxy's blog about web development, automation, and open-source",
	},
	fr: {
		title: "Fox's Blog",
		description: "Le blog de Fox3000foxy sur le développement web, l'automatisation et l'open-source",
	},
	zh: {
		title: "Fox's Blog",
		description: "Fox3000foxy 关于 web 开发、自动化和开源的博客",
	},
	ja: {
		title: "Fox's Blog",
		description: "Fox3000foxyのブログ -- Web開発、自動化、オープンソースについて",
	},
	ko: {
		title: "Fox's Blog",
		description: "Fox3000foxy의 블로그 -- 웹 개발, 자동화, 오픈소스",
	},
	tr: {
		title: "Fox'un Blogu",
		description: "Fox3000foxy'nin web geliştirme, otomasyon ve açık kaynak blogu",
	},
	it: {
		title: "Fox's Blog",
		description: "Il blog di Fox3000foxy su sviluppo web, automazione e open-source",
	},
	de: {
		title: "Fox's Blog",
		description: "Fox3000foxys Blog über Webentwicklung, Automatisierung und Open-Source",
	},
	ru: {
		title: "Fox's Blog",
		description: "Блог Fox3000foxy о веб-разработке, автоматизации и открытом исходном коде",
	},
	es: {
		title: "Fox's Blog",
		description: "El blog de Fox3000foxy sobre desarrollo web, automatización y código abierto",
	},
};

function escapeXml(text: string | number): string {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function toRssDate(dateStr: string): string {
	const d = new Date(`${dateStr}T12:00:00Z`);
	return d.toUTCString();
}

function generateFeed(lang: string, articles: ArticleMeta[]): string {
	const sorted = [...articles].sort(
		(a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
	);

	const meta = LANG_META[lang] || LANG_META.en;
	const feedUrl = lang === "en" ? `${SITE_URL}/feed.xml` : `${SITE_URL}/${lang}/feed.xml`;
	const siteLink = SITE_URL;

	const items = sorted.map(
		(article) => {
			const slug = article.slug;
			const link = `${SITE_URL}/blog/${encodeURIComponent(slug)}`;
			const pubDate = article.date ? toRssDate(article.date) : "";
			const tags = article.tags || [];
			const title = article.title || slug;

			return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(article.description || "")}</description>
      <pubDate>${pubDate}</pubDate>
      ${tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
    </item>`;
		}
	);

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(siteLink)}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${lang}</language>
    <lastBuildDate>${toRssDate(new Date().toISOString().split("T")[0])}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/icons/android-icon-192x192.png</url>
      <title>${escapeXml(meta.title)}</title>
      <link>${escapeXml(siteLink)}</link>
    </image>
    <copyright>${new Date().getFullYear()} Fox3000foxy</copyright>
    <managingEditor>fox3000foxy@users.noreply.github.com (Fox3000foxy)</managingEditor>
    <webMaster>fox3000foxy@users.noreply.github.com (Fox3000foxy)</webMaster>
    ${items.join("\n")}
  </channel>
</rss>`;
}

function main() {
	const root = process.cwd();
	const langs: { lang: string; articles: ArticleMeta[] }[] = [];

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

	for (const { lang, articles } of langs) {
		const feed = generateFeed(lang, articles);
		const outDir = lang === "en" ? path.join(root, OUTPUT_DIR) : path.join(root, OUTPUT_DIR, lang);
		fs.mkdirSync(outDir, { recursive: true });
		const outPath = path.join(outDir, "feed.xml");
		fs.writeFileSync(outPath, feed);
	}

	console.log(`RSS feeds generated: ${langs.length} languages`);
}

main();
