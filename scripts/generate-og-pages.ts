// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ARTICLES_DIR = "public/articles";
const OG_DIR = "dist/og";

function escapeXml(text: string | number): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapText(text: string, maxLen: number): string[] {
  const lines: string[] = [];
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.length > maxLen) {
      lines.push(line);
      line = word;
    } else {
      line = (line ? `${line} ` : "") + word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ogImageSvg(
  title: string,
  description: string,
  tags: string[]
): string {
  const titleLines = wrapText(title, 35);
  if (titleLines.length > 3) {
    titleLines.splice(2, titleLines.length - 2, "...");
  }
  const descLines = wrapText(description, 80);
  if (descLines.length > 2) {
    descLines.splice(1, descLines.length - 1, "...");
  }
  const titleStartY = 270;
  const titleEls = titleLines
    .map((l, i) =>
      `<text x="600" y="${titleStartY + i * 55}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="700" fill="#ffffff">${escapeXml(l)}</text>`
    )
    .join("\n");
  const descY = titleStartY + Math.min(titleLines.length, 3) * 55 + 25;
  const descEls = descLines
    .map((l, i) =>
      `<text x="600" y="${descY + i * 28}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#8b949e">${escapeXml(l)}</text>`
    )
    .join("\n");
  const tagY = descY + Math.min(descLines.length, 2) * 28 + 30;
  const tagEls = tags
    .slice(0, 5)
    .map((t, i) => {
      const cx = 600 + (i - Math.min(tags.length, 5) / 2) * 110 + 55;
      return `<rect x="${cx - 48}" y="${tagY - 14}" width="96" height="28" rx="14" fill="#21262d" stroke="#30363d" stroke-width="1"/>
  <text x="${cx}" y="${tagY + 5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#64b5f6">${escapeXml(t)}</text>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d1117"/>
  <rect x="0" y="0" width="1200" height="4" fill="#64b5f6"/>
  <text x="600" y="180" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="#64b5f6" letter-spacing="4">FOX3000FOXY.COM</text>
  <rect x="540" y="195" width="120" height="1" fill="#30363d"/>
${titleEls}
${descEls}
${tagEls}
  <text x="600" y="600" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#8b949e">fox3000foxy · Blog</text>
</svg>`;
}

function main() {
  const root = process.cwd();
  const langs = fs.readdirSync(path.join(root, ARTICLES_DIR), { withFileTypes: true });
  const bySlug = new Map();

  for (const entry of langs) {
    if (!entry.isDirectory()) continue;
    const lang = entry.name;
    const indexPath = path.join(root, ARTICLES_DIR, lang, "index.json");
    if (!fs.existsSync(indexPath)) continue;
    const articles = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (!Array.isArray(articles)) continue;
    for (const article of articles) {
      const slug = article.slug;
      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          slug,
          title: article.title || slug.replace(/-/g, " "),
          description: article.description || "",
          tags: [],
        });
      }
      const entry = bySlug.get(slug);
      if (lang === "en") {
        entry.title = article.title || entry.title;
        entry.description = article.description || entry.description;
        if (article.tags) entry.tags = article.tags;
      }
    }
  }

  fs.mkdirSync(path.join(root, OG_DIR), { recursive: true });
  let rendered = 0;
  let skipped = 0;

  // Generate default home.png
  const homeSvg = ogImageSvg("Fox's Blog", "Articles about web development, automation, and open-source", ["blog", "dev", "open-source"]);
  const homePngPath = path.join(root, OG_DIR, "home.png");
  if (!fs.existsSync(homePngPath)) {
    const buf = new Resvg(homeSvg, { fitTo: { mode: "original" } }).render().asPng();
    fs.writeFileSync(homePngPath, buf);
    rendered++;
  }

  for (const [slug, info] of bySlug) {
    const svgContent = ogImageSvg(info.title, info.description, info.tags);
    const pngPath = path.join(root, OG_DIR, `${slug}.png`);
    if (fs.existsSync(pngPath)) {
      skipped++;
    } else {
      const pngBuffer = new Resvg(svgContent, { fitTo: { mode: "original" } })
        .render()
        .asPng();
      fs.writeFileSync(pngPath, pngBuffer);
      rendered++;
    }
    fs.writeFileSync(path.join(root, OG_DIR, `${slug}.svg`), svgContent);
  }
  console.log(`OG images: ${rendered} rendered, ${skipped} cached`);
}

main();
