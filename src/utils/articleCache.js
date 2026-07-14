import { cacheBust } from "./cacheBust";
const MAX_CACHE = 100;
const articleCache = new Map();
const pendingFetch = new Map();
function cacheSet(key, value) {
    if (articleCache.size >= MAX_CACHE) {
        const first = articleCache.keys().next().value;
        if (first !== undefined) {
            articleCache.delete(first);
        }
    }
    articleCache.set(key, value);
}
function cacheKey(lang, slug) {
    return `${lang}:${slug}`;
}
export function fetchMarkdown(key, url) {
    if (articleCache.has(key)) {
        return articleCache.get(key);
    }
    if (pendingFetch.has(key)) {
        return pendingFetch.get(key);
    }
    const fetchPromise = fetch(cacheBust(url))
        .then((res) => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    })
        .then((text) => {
        if (typeof text === "string") {
            cacheSet(key, text);
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
function articleUrl(lang, slug) {
    return `/articles/${lang}/${encodeURIComponent(slug)}.md`;
}
function fetchWithFallback(key, lang, slug) {
    const cached = articleCache.get(key);
    if (cached !== undefined) {
        return cached;
    }
    if (pendingFetch.has(key)) {
        return pendingFetch.get(key);
    }
    const primaryUrl = articleUrl(lang, slug);
    const fallbackUrl = lang === "en" ? null : articleUrl("en", slug);
    const fetchPromise = fetch(cacheBust(primaryUrl))
        .then((res) => {
        if (res.ok) {
            return res.text();
        }
        if (fallbackUrl) {
            return fetch(cacheBust(fallbackUrl)).then((r) => r.ok ? r.text() : null);
        }
        return null;
    })
        .then((text) => {
        if (typeof text === "string") {
            cacheSet(key, text);
            return text;
        }
        return null;
    })
        .catch(() => null)
        .finally(() => pendingFetch.delete(key));
    pendingFetch.set(key, fetchPromise);
    return fetchPromise;
}
export function fetchArticleMarkdown(slug, lang) {
    return fetchWithFallback(cacheKey(lang, slug), lang, slug);
}
export function getCachedArticleMarkdown(slug, lang) {
    if (lang) {
        return articleCache.get(cacheKey(lang, slug)) ?? null;
    }
    return articleCache.get(slug) ?? null;
}
export function getCachedMarkdown(key) {
    return articleCache.get(key) ?? null;
}
export function prefetchArticleMarkdown(slugs, lang) {
    for (const slug of slugs) {
        if (slug &&
            !articleCache.has(cacheKey(lang, slug)) &&
            !pendingFetch.has(cacheKey(lang, slug))) {
            void fetchArticleMarkdown(slug, lang);
        }
    }
}
export function prefetchMarkdownEntries(entries) {
    for (const entry of entries) {
        const { key, url } = entry;
        if (key && !articleCache.has(key) && !pendingFetch.has(key)) {
            void fetchMarkdown(key, url);
        }
    }
}
