const articleCache = new Map<string, string>();
const pendingFetch = new Map<string, Promise<string | null>>();

export async function fetchMarkdown(
	key: string,
	url: string
): Promise<string | null> {
	if (articleCache.has(key)) {
		return articleCache.get(key)!;
	}

	if (pendingFetch.has(key)) {
		return pendingFetch.get(key)!;
	}

	const fetchPromise = fetch(url)
		.then((res) => {
			if (!res.ok) { return null; }
			return res.text();
		})
		.then((text) => {
			if (typeof text === "string") {
				articleCache.set(key, text);
				return text;
			}
			return null;
		})
		.catch(() => null)
		.finally(() => {
			pendingFetch.delete(key);
		});

	pendingFetch.set(key, fetchPromise);
	return fetchPromise;
}

export async function fetchArticleMarkdown(
	slug: string
): Promise<string | null> {
	return fetchMarkdown(slug, `/articles/${encodeURIComponent(slug)}.md`);
}

export function getCachedArticleMarkdown(slug: string): string | null {
	return articleCache.get(slug) ?? null;
}

export function prefetchArticleMarkdown(slugs: string[]): void {
	for (const slug of slugs) {
		if (slug && !articleCache.has(slug) && !pendingFetch.has(slug)) {
			void fetchArticleMarkdown(slug);
		}
	}
}

export function prefetchMarkdownEntries(
	entries: { key: string; url: string }[]
): void {
	for (const entry of entries) {
		const { key, url } = entry;
		if (key && !articleCache.has(key) && !pendingFetch.has(key)) {
			void fetchMarkdown(key, url);
		}
	}
}
