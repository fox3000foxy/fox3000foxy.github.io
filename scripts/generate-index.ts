// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "yaml";

interface ArticleMeta {
	slug: string;
	title?: string;
	description?: string;
	date?: string;
	lastmod?: string;
	readingTime?: number;
	aiGenerated?: boolean;
	tags?: string[];
	series?: string;
	authors?: string[];
}

function estimateReadingTime(text: string): number {
	const noCode = text.replace(/```[\s\S]*?```/g, "");
	const clean = noCode.replace(/`[^`]+`/g, "");
	const words = clean.trim().split(/\s+/).length;
	return Math.max(1, Math.ceil(words / 150));
}

function parseFrontMatter(text: string): { meta: Partial<ArticleMeta>; content: string } {
	const meta: Partial<ArticleMeta> = {};
	let content = text;

	if (text.startsWith("---\n")) {
		const end = text.indexOf("\n---\n", 4);
		if (end !== -1) {
			const raw = text.slice(4, end);
			content = text.slice(end + 5);
			try {
				const parsed = parse(raw);
				if (parsed && typeof parsed === "object") {
					Object.assign(meta, parsed);
				}
			} catch {
				// yaml parse failed, keep empty meta
			}
		}
	}

	return { meta, content };
}

	function main() {
	const root = process.cwd();
	const articlesDir = path.join(root, "public/articles");

	const langDirs = fs
		.readdirSync(articlesDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== "assets");

	for (const entry of langDirs) {
		const lang = entry.name;
		const langPath = path.join(articlesDir, lang);
		const files = fs.readdirSync(langPath).filter((f) => f.endsWith(".md") && f !== "index.json");

		// Read existing index.json to preserve metadata for articles without front matter yet
		const indexPath = path.join(langPath, "index.json");
		let existing: ArticleMeta[] = [];
		try {
			existing = JSON.parse(fs.readFileSync(indexPath, "utf8"));
			if (!Array.isArray(existing)) existing = [];
		} catch {
			existing = [];
		}
		const existingBySlug = new Map(existing.map((a) => [a.slug, a]));

		const articles: ArticleMeta[] = [];

		for (const file of files) {
			const slug = file.replace(/\.md$/, "");
			const text = fs.readFileSync(path.join(langPath, file), "utf8");
			const { meta, content } = parseFrontMatter(text);
			const readingTime = estimateReadingTime(content);
			// Merge: front matter overrides existing index.json data
			const existingMeta = existingBySlug.get(slug) || {};
			articles.push({ slug, readingTime, ...existingMeta, ...meta });
		}

		articles.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

		fs.writeFileSync(indexPath, JSON.stringify(articles, null, 2) + "\n");
		console.log(`Generated index.json for ${lang}: ${articles.length} articles`);
	}
}

main();
