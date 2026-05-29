import { useEffect, useRef } from "react";

const GISCUS_CONFIG = {
	repo: "fox3000foxy/fox3000foxy.github.io" as const,
	repoId: "R_kgDORhZXLg" as const,
	category: "Announcements" as const,
	categoryId: "DIC_kwDORhZXLs4C-FFI" as const,
};

export default function GiscusComments({ lang }: { lang: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const script = document.createElement("script");
		script.src = "https://giscus.app/client.js";
		script.async = true;
		script.crossOrigin = "anonymous";
		script.setAttribute("data-repo", GISCUS_CONFIG.repo);
		script.setAttribute("data-repo-id", GISCUS_CONFIG.repoId);
		script.setAttribute("data-category", GISCUS_CONFIG.category);
		script.setAttribute("data-category-id", GISCUS_CONFIG.categoryId);
		script.setAttribute("data-mapping", "pathname");
		script.setAttribute("data-strict", "0");
		script.setAttribute("data-reactions-enabled", "1");
		script.setAttribute("data-emit-metadata", "0");
		script.setAttribute("data-input-position", "bottom");
		script.setAttribute("data-theme", "dark");
		script.setAttribute("data-lang", lang);
		ref.current?.appendChild(script);

		return () => {
			script.remove();
		};
	}, [lang]);

	return <div ref={ref} className="giscus-comments" />;
}
