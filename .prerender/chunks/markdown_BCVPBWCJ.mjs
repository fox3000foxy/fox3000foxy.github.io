import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
// src/lib/markdown.ts
var markdownCache = /* @__PURE__ */ new Map();
var highlightCache = /* @__PURE__ */ new Map();
var langAliases = { asm: "x86asm" };
marked.use(markedHighlight({
	langPrefix: "hljs language-",
	highlight(code, lang) {
		const key = `${lang ?? "none"}\x00${code}`;
		const cached = highlightCache.get(key);
		if (cached) return cached;
		const resolvedLang = lang ? langAliases[lang] || lang : null;
		if (resolvedLang && hljs.getLanguage(resolvedLang)) try {
			const result = hljs.highlight(code, { language: resolvedLang }).value;
			highlightCache.set(key, result);
			return result;
		} catch {}
		highlightCache.set(key, code);
		return code;
	}
}));
function slugify(text) {
	return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function renderMermaidSvg(code) {
	const hash = crypto.createHash("sha1").update(code).digest("hex").slice(0, 12);
	const outDir = path.resolve("dist/_mermaid");
	const cacheDir = path.resolve("public/_mermaid");
	const svgPath = path.join(outDir, `${hash}.svg`);
	if (fs.existsSync(svgPath)) return svgPath;
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
		execSync(`node_modules/.bin/mmdc -i "${mmdPath}" -o "${svgPath}" --backgroundColor transparent -q 2>/dev/null`, {
			timeout: 1e4,
			stdio: "pipe"
		});
	} catch {
		return "";
	}
	if (!fs.existsSync(svgPath)) return "";
	fs.copyFileSync(svgPath, path.join(cacheDir, `${hash}.svg`));
	return svgPath;
}
function renderMarkdown(content) {
	const cached = markdownCache.get(content);
	if (cached) return cached;
	content = content.replace(/\r\n/g, "\n");
	if (content.includes("```mermaid")) content = content.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
		const svgPath = renderMermaidSvg(code.trim());
		if (svgPath) return `<img src="/_mermaid/${path.basename(svgPath)}" alt="mermaid diagram" loading="lazy" decoding="async" class="mermaid-svg" />`;
		return `<pre class="mermaid-fallback">${code.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
	});
	let html = marked(content);
	html = html.replace(/<h([23])>(.*?)<\/h\1>/g, (_, level, text) => `<h${level} id="${slugify(text.replace(/<[^>]*>/g, ""))}">${text}</h${level}>`);
	html = html.replace(/<a\s+href="(https?:\/\/[^"]+)"([^>]*)>/g, (_, href, rest) => `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`);
	markdownCache.set(content, html);
	return html;
}
export { renderMarkdown as t };
