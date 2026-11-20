import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import { t as renderMarkdown } from "./markdown_BCVPBWCJ.mjs";
import fs from "node:fs";
import path from "node:path";
// src/lib/langContent.ts
function readAllHomeContent() {
	const result = {};
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/home.${lang}.md`);
		if (fs.existsSync(filePath)) result[lang] = renderMarkdown(fs.readFileSync(filePath, "utf-8"));
	}
	if (!result.en) {
		const fallback = path.resolve("public/home.md");
		if (fs.existsSync(fallback)) result.en = renderMarkdown(fs.readFileSync(fallback, "utf-8"));
	}
	const en = result.en ?? "";
	for (const lang of ALL_LANGS) if (!result[lang]) result[lang] = en;
	return result;
}
function stripFrontmatter(text) {
	const normalized = text.replace(/\r\n/g, "\n");
	if (normalized.startsWith("---\n")) {
		const end = normalized.indexOf("\n---\n", 4);
		if (end !== -1) return normalized.slice(end + 5);
	}
	return normalized;
}
function readAllArticleData(slug) {
	const raw = {};
	const content = {};
	const hasTranslation = {};
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
	if (!ALL_LANGS.some((l) => {
		return hasTranslation[l];
	})) return null;
	const allIndexes = readAllArticleIndexes();
	const verifiedByLang = {};
	for (const lang of ALL_LANGS) verifiedByLang[lang] = (allIndexes[lang] ?? []).find((e) => typeof e === "object" && e !== null && e.slug === slug)?.verified ?? false;
	const enEntry = (allIndexes.en ?? []).find((e) => typeof e === "object" && e !== null && e.slug === slug);
	return {
		raw,
		content,
		allIndexes,
		verified: verifiedByLang.en ?? false,
		verifiedByLang,
		firstImage: enEntry?.image || extractFirstImage(content.en || ""),
		hasTranslation
	};
}
function extractFirstImage(markdown) {
	const m = markdown.match(/!\[.*?\]\(([^)]+)\)/);
	if (m) {
		let url = m[1];
		if (url.startsWith("http")) return url;
		if (url.startsWith("/")) return `https://fox3000foxy.com${url}`;
		if (url.startsWith("assets/")) url = url.replace("assets/", "/articles/assets/");
		else url = `/${url}`;
		return `https://fox3000foxy.com${url}`;
	}
	return "";
}
var cachedIndexes = null;
function readAllArticleIndexes() {
	if (cachedIndexes) return cachedIndexes;
	const result = {};
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/articles/${lang}/index.json`);
		if (fs.existsSync(filePath)) result[lang] = JSON.parse(fs.readFileSync(filePath, "utf-8")).map((entry) => ({
			...entry,
			image: entry.image || ""
		}));
	}
	cachedIndexes = result;
	return result;
}
export { readAllArticleIndexes as n, readAllHomeContent as r, readAllArticleData as t };
