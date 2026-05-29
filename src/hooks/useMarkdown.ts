import { useEffect, useState } from "react";
import { fetchMarkdown, getCachedMarkdown } from "../utils/articleCache";

export function useMarkdown(url: string, key: string, fallbackUrl?: string) {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		const cached = getCachedMarkdown(key);
		if (cached !== null) {
			setContent(cached);
			setError(false);
			return;
		}

		async function load() {
			let text = await fetchMarkdown(key, url);
			if (text === null && fallbackUrl) {
				text = await fetchMarkdown(key, fallbackUrl);
			}
			if (text === null) {
				setError(true);
				return;
			}
			setContent(text);
		}
		load().catch(() => setError(true));
	}, [url, key, fallbackUrl]);

	return { content, error, loading: content === null };
}
