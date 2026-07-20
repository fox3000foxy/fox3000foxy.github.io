import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const markdownCache = new Map<string, string>();
const highlightCache = new Map<string, string>();

const langAliases: Record<string, string> = {
	asm: "x86asm",
};

marked.use(
	markedHighlight({
		langPrefix: "hljs language-",
		highlight(code, lang) {
			const key = `${lang ?? "none"}\x00${code}`;
			const cached = highlightCache.get(key);
			if (cached) {
				return cached;
			}
			const resolvedLang = lang ? langAliases[lang] || lang : null;
			if (resolvedLang && hljs.getLanguage(resolvedLang)) {
				try {
					const result = hljs.highlight(code, { language: resolvedLang }).value;
					highlightCache.set(key, result);
					return result;
				} catch {}
			}
			highlightCache.set(key, code);
			return code;
		},
	})
);

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function renderMermaidSvg(code: string): string {
	const hash = crypto
		.createHash("sha1")
		.update(code)
		.digest("hex")
		.slice(0, 12);
	const outDir = path.resolve("dist/_mermaid");
	const cacheDir = path.resolve("public/_mermaid");
	const svgPath = path.join(outDir, `${hash}.svg`);

	if (fs.existsSync(svgPath)) {
		return svgPath;
	}

	const cachedSvg = path.join(cacheDir, `${hash}.svg`);
	if (fs.existsSync(cachedSvg)) {
		fs.mkdirSync(outDir, { recursive: true });
		fs.copyFileSync(cachedSvg, svgPath);
		return svgPath;
	}

	fs.mkdirSync(outDir, { recursive: true });
	fs.mkdirSync(cacheDir, { recursive: true });
	const mmdPath = path.join(outDir, `${hash}.mmd`);
	fs.writeFileSync(mmdPath, code);

	try {
		execSync(
			`node_modules/.bin/mmdc -i "${mmdPath}" -o "${svgPath}" --backgroundColor transparent -q 2>/dev/null`,
			{ timeout: 10000, stdio: "pipe" }
		);
	} catch {
		return "";
	}
	if (!fs.existsSync(svgPath)) {
		return "";
	}
	fs.copyFileSync(svgPath, path.join(cacheDir, `${hash}.svg`));
	return svgPath;
}

export function renderMarkdown(content: string): string {
	const cached = markdownCache.get(content);
	if (cached) {
		return cached;
	}

	content = content.replace(/\r\n/g, "\n");

	if (content.includes("```mermaid")) {
		content = content.replace(
			/```mermaid\n([\s\S]*?)```/g,
			(_, code: string) => {
				const svgPath = renderMermaidSvg(code.trim());
				if (svgPath) {
					return `<img src="/_mermaid/${path.basename(svgPath)}" alt="mermaid diagram" loading="lazy" decoding="async" class="mermaid-svg" />`;
				}
				const escaped = code.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
				return `<pre class="mermaid-fallback">${escaped}</pre>`;
			}
		);
	}

	let html = marked(content) as string;

	html = html.replace(
		/<h([23])>(.*?)<\/h\1>/g,
		(_, level, text) =>
			`<h${level} id="${slugify(text.replace(/<[^>]*>/g, ""))}">${text}</h${level}>`
	);

	html = html.replace(
		/<a\s+href="(https?:\/\/[^"]+)"([^>]*)>/g,
		(_, href, rest) =>
			`<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`
	);

	markdownCache.set(content, html);
	return html;
}
