import type { ArticleMeta } from "../types";

export function parseFrontMatter(text: string): {
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
			for (const line of raw.split("\n")) {
				const colonIdx = line.indexOf(":");
				if (colonIdx === -1) {
					continue;
				}
				const key = line.slice(0, colonIdx).trim();
				const val = line.slice(colonIdx + 1).trim();
				if (key === "title") {
					meta.title = val.replace(/^["']|["']$/g, "");
				} else if (key === "description") {
					meta.description = val.replace(/^["']|["']$/g, "");
				} else if (key === "date") {
					meta.date = val;
				} else if (key === "lastmod") {
					meta.lastmod = val;
				} else if (key === "aiGenerated") {
					meta.aiGenerated = val === "true";
				} else if (key === "series") {
					meta.series = val;
				} else if (key === "tags" || key === "authors") {
					const arr = val
						.replace(/^\[|\]$/g, "")
						.split(",")
						.map((s) => s.trim().replace(/^["']|["']$/g, ""))
						.filter(Boolean);
					if (key === "tags") {
						meta.tags = arr;
					} else {
						meta.authors = arr;
					}
				} else if (key === "author_pubkey") {
					meta.author_pubkey = val;
				} else if (key === "author_sig") {
					meta.author_sig = val;
				}
			}
		}
	}

	return { meta, content };
}
