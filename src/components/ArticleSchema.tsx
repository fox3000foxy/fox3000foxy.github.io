import { useEffect } from "react";
import type { ArticleMeta } from "../types";

const SITE_URL = "https://fox3000foxy.com";

export default function ArticleSchema({
	meta,
	slug,
}: {
	meta: ArticleMeta;
	slug: string;
}) {
	const url = `${SITE_URL}/blog/${slug}`;

	useEffect(() => {
		const script = document.createElement("script");
		script.type = "application/ld+json";
		script.textContent = JSON.stringify({
			"@context": "https://schema.org",
			"@type": "Article",
			headline: meta.title ?? slug,
			description: meta.description ?? "",
			datePublished: meta.date ?? "",
			author: {
				"@type": "Person",
				name: "Fox3000foxy",
				url: "https://github.com/fox3000foxy",
			},
			url,
			inLanguage: "multiple",
			isAccessibleForFree: true,
			mainEntityOfPage: {
				"@type": "WebPage",
				"@id": url,
			},
		});

		document.head.appendChild(script);

		const link = document.createElement("link");
		link.rel = "canonical";
		link.href = url;
		document.head.appendChild(link);

		return () => {
			script.remove();
			link.remove();
		};
	}, [meta, slug, url]);

	return null;
}
