import fs from "node:fs";
import path from "node:path";
import { ALL_LANGS } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import { renderMarkdown } from "../lib/markdown";

export function readAllHomeContent(): Record<Lang, string> {
	const result = {} as Record<Lang, string>;
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/home.${lang}.md`);
		if (fs.existsSync(filePath)) {
			result[lang] = renderMarkdown(fs.readFileSync(filePath, "utf-8"));
		}
	}
	if (!result.en) {
		const fallback = path.resolve("public/home.md");
		if (fs.existsSync(fallback)) {
			result.en = renderMarkdown(fs.readFileSync(fallback, "utf-8"));
		}
	}
	const en = result.en ?? "";
	for (const lang of ALL_LANGS) {
		if (!result[lang]) {
			result[lang] = en;
		}
	}
	return result;
}

function stripFrontmatter(text: string): string {
	if (text.startsWith("---\n")) {
		const end = text.indexOf("\n---\n", 4);
		if (end !== -1) {
			return text.slice(end + 5);
		}
	}
	return text;
}

export function readAllArticleData(slug: string) {
	const raw: Record<Lang, string> = {} as Record<Lang, string>;
	const content: Record<Lang, string> = {} as Record<Lang, string>;
	const hasTranslation: Record<Lang, boolean> = {} as Record<Lang, boolean>;

	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/articles/${lang}/${slug}.md`);
		if (fs.existsSync(filePath)) {
			const text = fs.readFileSync(filePath, "utf-8");
			raw[lang] = text;
			content[lang] = stripFrontmatter(text);
			hasTranslation[lang] = true;
		} else {
			raw[lang] = "";
			content[lang] = "";
			hasTranslation[lang] = false;
		}
	}

	const hasAny = ALL_LANGS.some((l) => {
		return hasTranslation[l];
	});
	if (!hasAny) {
		return null;
	}

	const allIndexes = readAllArticleIndexes();

	const enEntry = (allIndexes.en ?? []).find(
		(e: unknown) =>
			typeof e === "object" &&
			e !== null &&
			(e as { slug?: string }).slug === slug
	) as { verified?: boolean; image?: string } | undefined;
	const verified = enEntry?.verified ?? false;
	const firstImage = enEntry?.image || extractFirstImage(content.en || "");

	return { raw, content, allIndexes, verified, firstImage, hasTranslation };
}

function extractFirstImage(markdown: string): string {
	const m = markdown.match(/!\[.*?\]\(([^)]+)\)/);
	if (m) {
		let url = m[1];
		if (url.startsWith("http")) {
			return url;
		}
		if (url.startsWith("/")) {
			return `https://fox3000foxy.com${url}`;
		}
		if (url.startsWith("assets/")) {
			url = url.replace("assets/", "/articles/assets/");
		} else {
			url = `/${url}`;
		}
		return `https://fox3000foxy.com${url}`;
	}
	return "";
}

let cachedIndexes: Record<Lang, unknown[]> | null = null;

export function readAllArticleIndexes(): Record<Lang, unknown[]> {
	if (cachedIndexes) {
		return cachedIndexes;
	}
	const result = {} as Record<Lang, unknown[]>;
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/articles/${lang}/index.json`);
		if (fs.existsSync(filePath)) {
			const index = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
				string,
				unknown
			>[];
			result[lang] = index.map((entry) => ({
				...entry,
				image: entry.image || "",
			}));
		}
	}
	cachedIndexes = result;
	return result;
}
