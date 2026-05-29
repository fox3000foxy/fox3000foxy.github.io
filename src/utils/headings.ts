export interface TocEntry {
	level: number;
	text: string;
	id: string;
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function parseHeadings(markdown: string): TocEntry[] {
	const regex = /^(#{2,3})\s+(.+)$/gm;
	const entries: TocEntry[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(markdown)) !== null) {
		const level = match[1].length;
		const text = match[2].trim();
		entries.push({ level, text, id: slugify(text) });
	}
	return entries;
}
