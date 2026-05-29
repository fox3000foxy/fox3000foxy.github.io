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
			url: `${SITE_URL}/blog/${slug}`,
			inLanguage: "multiple",
			isAccessibleForFree: true,
			mainEntityOfPage: {
				"@type": "WebPage",
				"@id": `${SITE_URL}/blog/${slug}`,
			},
		});

		document.head.appendChild(script);
		return () => {
			script.remove();
		};
	}, [meta, slug]);

	return null;
}
