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

export function renderMarkdown(content: string): string {
  let processed = content.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_, code) => `<div class="mermaid">\n${code.trim()}\n</div>`
  );

  let html = marked(processed) as string;

  html = html.replace(
    /<h([23])>(.*?)<\/h\1>/g,
    (_, level, text) => `<h${level} id="${slugify(text.replace(/<[^>]*>/g, ""))}">${text}</h${level}>`
  );

  html = html.replace(
    /<a\s+href="(https?:\/\/[^"]+)"([^>]*)>/g,
    (_, href, rest) => `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`
  );

  return html;
}
