// @ts-nocheck
import * as crypto from "node:crypto";
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
	author_pubkey?: string;
	author_sig?: string;
	verified?: boolean;
	body?: string;
}

function verifyArticle(
	slug: string,
	author: string,
	date: string,
	content: string,
	signatureBase64: string,
	pubkeyBase64: string
): boolean {
	try {
		const msg = `${slug}|${author}|${date}|${content}`;
		const key = crypto.createPublicKey({
			key: Buffer.from(pubkeyBase64, "base64"),
			format: "der",
			type: "spki",
		});
		const verify = crypto.createVerify("SHA256");
		verify.update(msg);
		verify.end();
		return verify.verify(
			{ key, dsaEncoding: "ieee-p1363" } as crypto.VerifyOptions & { key: crypto.KeyLike },
			signatureBase64,
			"base64"
		);
	} catch {
		return false;
	}
}

function estimateReadingTime(text: string): number {
	const noCode = text.replace(/```[\s\S]*?```/g, "");
	const clean = noCode.replace(/`[^`]+`/g, "");
	const words = clean.trim().split(/\s+/).length;
	return Math.max(1, Math.ceil(words / 150));
}

function extractFirstImage(markdown: string): string {
	const m = markdown.match(/!\[.*?\]\(([^)]+)\)/);
	if (m) {
		let url = m[1];
		if (url.startsWith("http")) { return url; }
		if (url.startsWith("/")) { return `https://fox3000foxy.com${url}`; }
		if (url.startsWith("assets/")) { url = url.replace("assets/", "/articles/assets/"); }
		else { url = `/${url}`; }
		return `https://fox3000foxy.com${url}`;
	}
	return "";
}

function parseFrontMatter(text: string): {
	meta: Partial<ArticleMeta>;
	content: string;
} {
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

	// Build English index first so other languages can fall back
	const enPath = path.join(articlesDir, "en");
	const enFiles = fs
		.readdirSync(enPath)
		.filter((f) => f.endsWith(".md") && f !== "index.json");
	const enArticles: ArticleMeta[] = [];
	for (const file of enFiles) {
		const slug = file.replace(/\.md$/, "");
		const text = fs.readFileSync(path.join(enPath, file), "utf8");
		const { meta, content } = parseFrontMatter(text);
		const readingTime = estimateReadingTime(content);
		const body = content.replace(/^## .+/m, "").replace(/\n{3,}/g, "\n\n").substring(0, 500).trimEnd();
		const verified =
			meta.author_sig && meta.author_pubkey
				? verifyArticle(
						slug,
						(meta.authors?.[0] || ""),
						(meta.date || ""),
						content,
						meta.author_sig,
						meta.author_pubkey
					)
				: false;
		enArticles.push({ slug, readingTime, body, verified, ...meta });
	}
	const enBySlug = new Map(enArticles.map((a) => [a.slug, a]));

	for (const entry of langDirs) {
		const lang = entry.name;
		const langPath = path.join(articlesDir, lang);
		const files = fs
			.readdirSync(langPath)
			.filter((f) => f.endsWith(".md") && f !== "index.json");

		// Read existing index.json to preserve metadata for articles without front matter yet
		const indexPath = path.join(langPath, "index.json");
		let existing: ArticleMeta[] = [];
		try {
			existing = JSON.parse(fs.readFileSync(indexPath, "utf8"));
			if (!Array.isArray(existing)) {
				existing = [];
			}
		} catch {
			existing = [];
		}
		const existingBySlug = new Map(existing.map((a) => [a.slug, a]));

		const articles: ArticleMeta[] = [];

		// Process markdown files present in this language
		for (const file of files) {
			const slug = file.replace(/\.md$/, "");
			const text = fs.readFileSync(path.join(langPath, file), "utf8");
			const { meta, content } = parseFrontMatter(text);
			const readingTime = estimateReadingTime(content);
			const existingMeta = existingBySlug.get(slug) || {};
			const enMeta = enBySlug.get(slug);
			const verified = enMeta?.verified ?? false;
			const body = content.replace(/^## .+/m, "").replace(/\n{3,}/g, "\n\n").substring(0, 500).trimEnd();
			articles.push({ slug, readingTime, body, verified, ...existingMeta, ...meta });
		}

		// Fall back to English articles for any slugs missing in this language
		if (lang !== "en") {
			const presentSlugs = new Set(articles.map((a) => a.slug));
			for (const [slug, enMeta] of enBySlug) {
				if (!presentSlugs.has(slug)) {
					const existingMeta = existingBySlug.get(slug) || {};
					articles.push({
						slug,
						readingTime: enMeta.readingTime!,
						...existingMeta,
						...enMeta,
					});
				}
			}
		}

		articles.sort(
			(a, b) =>
				new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
		);

		// Add firstImage to index for EN articles
		if (lang === "en") {
			for (const article of articles) {
				const filePath = path.join(langPath, `${article.slug}.md`);
				if (fs.existsSync(filePath)) {
					const text = fs.readFileSync(filePath, "utf8");
					const { content } = parseFrontMatter(text);
					article.image = extractFirstImage(content);
				}
			}
		}

		fs.writeFileSync(indexPath, `${JSON.stringify(articles, null, 2)}\n`);
		console.log(
			`Generated index.json for ${lang}: ${articles.length} articles`
		);
	}
}

main();
