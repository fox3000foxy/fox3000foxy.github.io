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

export function renderMarkdown(content: string): string {
  return marked(content) as string;
}
