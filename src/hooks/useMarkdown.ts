import { useEffect, useState } from "react";
import { fetchMarkdown, getCachedArticleMarkdown } from "../utils/articleCache";

export function useMarkdown(url: string, key: string) {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		const cached = getCachedArticleMarkdown(key);
		if (cached !== null) {
			setContent(cached);
			setError(false);
			return;
		}

		Promise.resolve(fetchMarkdown(key, url))
			.then((text) => {
				if (text === null) {
					setError(true);
					return;
				}
				setContent(text);
			})
			.catch(() => setError(true));
	}, [url, key]);

	return { content, error, loading: content === null };
}
