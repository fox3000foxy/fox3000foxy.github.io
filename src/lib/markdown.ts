import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

marked.use(
	markedHighlight({
		langPrefix: "hljs language-",
		highlight(code, lang) {
			if (lang && hljs.getLanguage(lang)) {
				try {
					return hljs.highlight(code, { language: lang }).value;
				} catch {}
			}
			return hljs.highlightAuto(code).value;
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

const TMP_DIR = path.resolve("node_modules/.cache/mermaid-tmp");

function renderMermaidToSvg(code: string): string {
	const id = `mmd_${Math.random().toString(36).slice(2, 8)}`;
	const mmdPath = path.join(TMP_DIR, `${id}.mmd`);
	const svgPath = path.join(TMP_DIR, `${id}.svg`);
	try {
		fs.mkdirSync(TMP_DIR, { recursive: true });
		fs.writeFileSync(mmdPath, code);
		execSync(
			`node_modules/.bin/mmdc -i "${mmdPath}" -o "${svgPath}" --backgroundColor transparent -q 2>/dev/null`,
			{ timeout: 30000, stdio: "pipe" }
		);
		if (fs.existsSync(svgPath)) {
			const svg = fs.readFileSync(svgPath, "utf-8");
			return svg;
		}
	} catch {}
	return `<pre class="mermaid-fallback">${code}</pre>`;
}

export function renderMarkdown(content: string): string {
	const mermaidBlocks: { code: string; svg: string }[] = [];

	const processed = content.replace(
		/```mermaid\n([\s\S]*?)```/g,
		(_, code: string) => {
			const svg = renderMermaidToSvg(code.trim());
			const key = `MERMAID_${mermaidBlocks.length}_`;
			mermaidBlocks.push({ code: code.trim(), svg });
			return key;
		}
	);

	let html = marked(processed) as string;

	html = html.replace(/MERMAID_(\d+)_/g, (_, idx) => {
		const block = mermaidBlocks[Number.parseInt(idx, 10)];
		if (block.svg) {
			return block.svg;
		}
		return `<pre class="mermaid-fallback">${block.code}</pre>`;
	});

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

	return html;
}
