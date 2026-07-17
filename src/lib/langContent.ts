import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

export function readAllArticleContent(slug: string): Record<Lang, string> {
	const result = {} as Record<Lang, string>;
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/articles/${lang}/${slug}.md`);
		if (fs.existsSync(filePath)) {
			result[lang] = renderMarkdown(fs.readFileSync(filePath, "utf-8"));
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

function rawEcdsaToDer(raw: Buffer): Buffer {
	const r = raw.subarray(0, 32);
	const s = raw.subarray(32, 64);
	const encInt = (buf: Buffer) => {
		if (buf[0] & 0x80) {
			return Buffer.concat([Buffer.from([0x00]), buf]);
		}
		let i = 0;
		while (i < buf.length - 1 && buf[i] === 0) {
			i++;
		}
		return buf.subarray(i);
	};
	const rEnc = encInt(r);
	const sEnc = encInt(s);
	return Buffer.concat([
		Buffer.from([0x30, 4 + rEnc.length + sEnc.length]),
		Buffer.from([0x02, rEnc.length]),
		rEnc,
		Buffer.from([0x02, sEnc.length]),
		sEnc,
	]);
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
		const sigRaw = Buffer.from(signatureBase64, "base64");
		const sigDer = rawEcdsaToDer(sigRaw);
		return crypto.verify("SHA256", Buffer.from(msg), key, sigDer);
	} catch {
		return false;
	}
}

export function readAllArticleData(slug: string) {
	const raw: Record<Lang, string> = {} as Record<Lang, string>;
	const content: Record<Lang, string> = {} as Record<Lang, string>;
	let enContent = "";
	let enRaw = "";

	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/articles/${lang}/${slug}.md`);
		if (fs.existsSync(filePath)) {
			const text = fs.readFileSync(filePath, "utf-8");
			raw[lang] = text;
			content[lang] = stripFrontmatter(text);
			if (lang === "en") {
				enContent = content[lang];
				enRaw = text;
			}
		}
	}

	for (const lang of ALL_LANGS) {
		if (!content[lang]) {
			content[lang] = enContent;
			raw[lang] = enRaw;
		}
	}

	const allIndexes = readAllArticleIndexes();

	// Verify signature at build time
	const enEntry = (allIndexes.en ?? []).find(
		(e: unknown) =>
			typeof e === "object" &&
			e !== null &&
			(e as { slug?: string }).slug === slug
	) as { author_sig?: string; authors?: string[]; date?: string; author_pubkey?: string } | undefined;
	const verified = enEntry?.author_sig && enEntry?.author_pubkey
		? verifyArticle(
				slug,
				enEntry.authors?.[0] || "",
				enEntry.date || "",
				enContent,
				enEntry.author_sig,
				enEntry.author_pubkey
			)
		: false;

	const firstImage = extractFirstImage(enContent);

	return { raw, content, allIndexes, verified, firstImage };
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
			result[lang] = index.map((entry) => {
				const slug = entry.slug as string;
				const mdPath = path.resolve(`public/articles/en/${slug}.md`);
				if (fs.existsSync(mdPath)) {
					const text = fs.readFileSync(mdPath, "utf-8");
					const content = stripFrontmatter(text);
					const img = extractFirstImage(content);
					return { ...entry, image: img };
				}
				return entry;
			});
		}
	}
	cachedIndexes = result;
	return result;
}
