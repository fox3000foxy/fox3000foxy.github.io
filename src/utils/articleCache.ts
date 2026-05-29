const articleCache = new Map<string, string>();
const pendingFetch = new Map<string, Promise<string | null>>();

function cacheKey(lang: string, slug: string): string {
	return `${lang}:${slug}`;
}

export function fetchMarkdown(
	key: string,
	url: string
): string | Promise<string | null> {
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

function articleUrl(lang: string, slug: string): string {
	return `/articles/${lang}/${encodeURIComponent(slug)}.md`;
}

function fetchWithFallback(
	key: string,
	lang: string,
	slug: string
): string | Promise<string | null> {
	const cached = articleCache.get(key);
	if (cached !== undefined) { return cached; }
	if (pendingFetch.has(key)) { return pendingFetch.get(key)!; }

	const primaryUrl = articleUrl(lang, slug);
	const fallbackUrl = lang !== "en" ? articleUrl("en", slug) : null;

	const fetchPromise = fetch(primaryUrl)
		.then((res) => {
			if (res.ok) { return res.text(); }
			if (fallbackUrl) { return fetch(fallbackUrl).then((r) => (r.ok ? r.text() : null)); }
			return null;
		})
		.then((text) => {
			if (typeof text === "string") {
				articleCache.set(key, text);
				return text;
			}
			return null;
		})
		.catch(() => null)
		.finally(() => pendingFetch.delete(key));

	pendingFetch.set(key, fetchPromise);
	return fetchPromise;
}

export function fetchArticleMarkdown(
	slug: string,
	lang: string
): string | Promise<string | null> {
	return fetchWithFallback(cacheKey(lang, slug), lang, slug);
}

export function getCachedArticleMarkdown(
	slug: string,
	lang?: string
): string | null {
	if (lang) { return articleCache.get(cacheKey(lang, slug)) ?? null; }
	return articleCache.get(slug) ?? null;
}

export function getCachedMarkdown(key: string): string | null {
	return articleCache.get(key) ?? null;
}

export function prefetchArticleMarkdown(
	slugs: string[],
	lang: string
): void {
	for (const slug of slugs) {
		if (slug && !articleCache.has(cacheKey(lang, slug)) && !pendingFetch.has(cacheKey(lang, slug))) {
			void fetchArticleMarkdown(slug, lang);
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
