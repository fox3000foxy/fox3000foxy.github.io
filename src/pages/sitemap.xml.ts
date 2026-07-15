import fs from "node:fs";
import path from "node:path";
import { SITE_URL, ALL_LANGS } from "../lib/i18n";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface ArticleMeta {
  slug?: string;
  date?: string;
  lastmod?: string;
}

function readArticles(lang: string): ArticleMeta[] {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(`public/articles/${lang}/index.json`), "utf-8"));
  } catch {
    return [];
  }
}

export function GET() {
  const site = SITE_URL;

  const staticPages = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/blog", priority: "0.9", changefreq: "daily" },
    { loc: "/projects", priority: "0.8", changefreq: "weekly" },
    { loc: "/tags", priority: "0.6", changefreq: "weekly" },
    { loc: "/archive", priority: "0.5", changefreq: "monthly" },
    { loc: "/legacy", priority: "0.5", changefreq: "monthly" },
    { loc: "/uses", priority: "0.4", changefreq: "monthly" },
    { loc: "/photos", priority: "0.3", changefreq: "monthly" },
    { loc: "/contact", priority: "0.3", changefreq: "monthly" },
  ];

  const allTags = new Set<string>();
  const articleUrls = new Map<string, string>();

  for (const lang of ALL_LANGS) {
    const articles = readArticles(lang);
    for (const a of articles) {
      if (a.slug && !articleUrls.has(a.slug)) {
        const lastmod = a.lastmod || a.date || "";
        articleUrls.set(a.slug, lastmod);
      }
      if (a.tags) {
        for (const tag of a.tags) allTags.add(tag);
      }
    }
  }

  const entries: string[] = [];

  for (const p of staticPages) {
    const url = `${site}${p.loc}`;
    entries.push(`  <url>
    <loc>${escapeXml(url)}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);
  }

  for (const [slug, lastmod] of articleUrls) {
    const url = `${site}/blog/${slug}`;
    entries.push(`  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  for (const tag of allTags) {
    const url = `${site}/tags/${encodeURIComponent(tag)}`;
    entries.push(`  <url>
    <loc>${escapeXml(url)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`);
  }

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
}
