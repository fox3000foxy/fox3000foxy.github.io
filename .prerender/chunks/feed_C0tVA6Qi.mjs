import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { r as SITE_URL } from "./i18n_Bu9Xwf1t.mjs";
import fs from "node:fs";
import path from "node:path";
// src/pages/feed.xml.ts
var feed_xml_exports = /* @__PURE__ */ __exportAll({ GET: () => GET });
function escapeXml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function GET() {
	const siteUrl = SITE_URL;
	const lang = "en";
	const title = "Fox's Blog";
	const description = "Fox3000foxy's blog about web development, automation, and open-source";
	const feedUrl = `${siteUrl}/feed.xml`;
	const now = (/* @__PURE__ */ new Date()).toUTCString();
	const indexRaw = fs.readFileSync(path.resolve(`public/articles/${lang}/index.json`), "utf-8");
	const itemsXml = JSON.parse(indexRaw).map((article) => {
		const slug = article.slug;
		const mdPath = path.resolve(`public/articles/${lang}/${slug}.md`);
		let body = "";
		let image = "";
		try {
			const raw = fs.readFileSync(mdPath, "utf-8");
			const fmEnd = raw.indexOf("\n---\n", 4);
			body = fmEnd !== -1 && raw.startsWith("---\n") ? raw.slice(fmEnd + 5).trim() : raw;
			const ogPath = path.resolve(`public/og/${slug}.png`);
			if (fs.existsSync(ogPath)) image = `${siteUrl}/og/${slug}.png`;
			else {
				const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
				if (firstImg) image = firstImg[1].startsWith("http") ? firstImg[1] : `${siteUrl}${firstImg[1].replace(/^\.?\//, "/")}`;
			}
		} catch {}
		const tags = article.tags || [];
		const pubDate = article.date ? new Date(article.date).toUTCString() : now;
		const articleUrl = `${siteUrl}/blog/${slug}`;
		const tagXml = tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n");
		const enclosureXml = image ? `\n      <enclosure url="${escapeXml(image)}" type="image/png" length="0" />` : "";
		return `    <item>
      <title>${escapeXml(article.title || slug)}</title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <description>${escapeXml(article.description || "")}</description>
      <pubDate>${pubDate}</pubDate>${enclosureXml}
${tagXml}    </item>`;
	}).join("\n");
	return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <managingEditor>fox3000foxy@users.noreply.github.com (Fox3000foxy)</managingEditor>
    <webMaster>fox3000foxy@users.noreply.github.com (Fox3000foxy)</webMaster>
    <generator>WordPress 5.9.3</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <image>
      <url>${siteUrl}/og/home.png</url>
      <title>${escapeXml(title)}</title>
      <link>${siteUrl}</link>
    </image>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
// \0virtual:astro:page:src/pages/feed.xml@_@ts
var page = () => feed_xml_exports;
export { page };
