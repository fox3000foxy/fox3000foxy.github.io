import fs from "node:fs";
import path from "node:path";
import rss from "@astrojs/rss";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "../config";
export function GET() {
    const indexRaw = fs.readFileSync(path.resolve("public/articles/en/index.json"), "utf-8");
    const articles = JSON.parse(indexRaw);
    return rss({
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        site: SITE_URL,
        items: articles.map((article) => {
            const slug = article.slug;
            const mdPath = path.resolve(`public/articles/en/${slug}.md`);
            let body = "";
            try {
                body = fs.readFileSync(mdPath, "utf-8");
                const fmEnd = body.indexOf("\n---\n", 4);
                if (fmEnd !== -1 && body.startsWith("---\n")) {
                    body = body.slice(fmEnd + 5).trim();
                }
            }
            catch { }
            return {
                title: article.title || slug,
                description: article.description || "",
                pubDate: article.date ? new Date(article.date) : new Date(),
                link: `/blog/${slug}`,
                content: body,
                author: AUTHOR,
            };
        }),
        customData: `<language>en</language><atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />`,
    });
}
