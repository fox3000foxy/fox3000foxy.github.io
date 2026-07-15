import fs from "node:fs";
import path from "node:path";
import { SITE_URL } from "../lib/i18n";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function GET() {
  const site = SITE_URL;
  let articles: { slug?: string; title?: string; date?: string }[] = [];
  try {
    articles = JSON.parse(fs.readFileSync(path.resolve("public/articles/en/index.json"), "utf-8"));
  } catch {}

  const urlEntries = articles
    .filter((a) => a.date)
    .map((a) => `  <url>
    <loc>${escapeXml(`${site}/blog/${a.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>Fox's Blog</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${a.date}</news:publication_date>
      <news:title>${escapeXml(a.title || a.slug || "")}</news:title>
    </news:news>
  </url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlEntries}
</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
}
