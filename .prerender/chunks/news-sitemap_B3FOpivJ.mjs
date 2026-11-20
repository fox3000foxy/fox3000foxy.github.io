import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { r as SITE_URL } from "./i18n_Bu9Xwf1t.mjs";
import fs from "node:fs";
import path from "node:path";
// src/pages/news-sitemap.xml.ts
var news_sitemap_xml_exports = /* @__PURE__ */ __exportAll({ GET: () => GET });
function escapeXml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function GET() {
	const site = SITE_URL;
	let articles = [];
	try {
		articles = JSON.parse(fs.readFileSync(path.resolve("public/articles/en/index.json"), "utf-8"));
	} catch {}
	const twoDaysAgo = Date.now() - 1728e5;
	const urlEntries = articles.filter((a) => a.date).filter((a) => {
		const d = new Date(a.date).getTime();
		return !Number.isNaN(d) && d >= twoDaysAgo;
	}).map((a) => `  <url>
    <loc>${escapeXml(`${site}/blog/${a.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>Fox's Blog</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${a.date}</news:publication_date>
      <news:title>${escapeXml(a.title || a.slug || "")}</news:title>
    </news:news>
  </url>`).join("\n");
	return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlEntries}
</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
// \0virtual:astro:page:src/pages/news-sitemap.xml@_@ts
var page = () => news_sitemap_xml_exports;
export { page };
