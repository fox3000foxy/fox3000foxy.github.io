import fs from "node:fs";
import path from "node:path";
import { SITE_URL, ALL_LANGS, LANG_LABELS } from "../../lib/i18n";
import type { Lang } from "../../lib/i18n";
import { renderMarkdown } from "../../lib/markdown";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function getStaticPaths() {
  return ALL_LANGS.map((lang) => ({ params: { lang } }));
}

export function GET({ params }: { params: { lang: string } }) {
  const lang = params.lang as Lang;
  const siteUrl = SITE_URL;
  const label = LANG_LABELS[lang];
  const title = `Fox's Blog (${label})`;
  const description = `Fox3000foxy's blog about web development, automation, and open-source — ${label}`;
  const feedUrl = `${siteUrl}/feed.${lang}.xml`;
  const now = new Date().toUTCString();

  let indexRaw = "[]";
  try {
    indexRaw = fs.readFileSync(path.resolve(`public/articles/${lang}/index.json`), "utf-8");
  } catch {
    try {
      indexRaw = fs.readFileSync(path.resolve("public/articles/en/index.json"), "utf-8");
    } catch {}
  }
  const articles = JSON.parse(indexRaw);

  const itemsXml = articles.map((article: Record<string, unknown>) => {
    const slug = article.slug as string;
    const mdPath = path.resolve(`public/articles/${lang}/${slug}.md`);
    let body = "";
    let image = "";
    try {
      const raw = fs.readFileSync(mdPath, "utf-8");
      const fmEnd = raw.indexOf("\n---\n", 4);
      body = fmEnd !== -1 && raw.startsWith("---\n") ? raw.slice(fmEnd + 5).trim() : raw;
      const ogPath = path.resolve(`public/og/${slug}.png`);
      if (fs.existsSync(ogPath)) {
        image = `${siteUrl}/og/${slug}.png`;
      } else {
        const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
        if (firstImg) image = firstImg[1].startsWith("http") ? firstImg[1] : `${siteUrl}${firstImg[1].replace(/^\.?\//, "/")}`;
      }
    } catch {}

    let htmlBody = "";
    try {
      htmlBody = renderMarkdown(body.replaceAll("assets/", "/articles/assets/"));
    } catch {
      htmlBody = body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    }

    const tags = (article.tags as string[]) || [];
    const pubDate = article.date ? new Date(article.date as string).toUTCString() : now;
    const articleUrl = `${siteUrl}/blog/${slug}`;
    const tagXml = tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n");
    const enclosureXml = image ? `\n      <enclosure url="${escapeXml(image)}" type="image/png" length="0" />` : "";

    return `    <item>
      <title>${escapeXml((article.title as string) || slug)}</title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <description>${escapeXml((article.description as string) || "")}</description>
      <pubDate>${pubDate}</pubDate>${enclosureXml}
      <content:encoded><![CDATA[${htmlBody}]]></content:encoded>
${tagXml}    </item>`;
  }).join("\n");

  const altLinks = ALL_LANGS
    .filter((l) => l !== lang)
    .map((l) => `    <atom:link href="${siteUrl}/feed.${l}.xml" rel="alternate" type="application/rss+xml" hreflang="${l}" />`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(description)}</description>
    <language>${lang}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <managingEditor>fox3000foxy@users.noreply.github.com (Fox3000foxy)</managingEditor>
    <webMaster>fox3000foxy@users.noreply.github.com (Fox3000foxy)</webMaster>
    <generator>Astro v7</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <image>
      <url>${siteUrl}/og/home.png</url>
      <title>${escapeXml(title)}</title>
      <link>${siteUrl}</link>
    </image>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    <atom:link href="${siteUrl}/feed.xml" rel="alternate" type="application/rss+xml" hreflang="x-default" />
${altLinks}
${itemsXml}
  </channel>
</rss>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
}
