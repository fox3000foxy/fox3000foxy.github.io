import { useEffect, useRef, useState } from "react";

const GISCUS_CONFIG = {
	repo: "fox3000foxy/fox3000foxy.github.io" as const,
	repoId: "R_kgDORhZXLg" as const,
	category: "Announcements" as const,
	categoryId: "DIC_kwDORhZXLs4C-FFI" as const,
};

export default function GiscusComments({ lang }: { lang: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!mounted) return;
		const cb = document.getElementById("theme-toggle") as HTMLInputElement | null;
		const isLight = cb?.checked ?? false;

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
		script.setAttribute("data-theme", isLight ? "light" : "dark");
		script.setAttribute("data-lang", lang);
		ref.current?.appendChild(script);

		function onThemeChange() {
			const iframe = ref.current?.querySelector("iframe");
			if (iframe) {
				const checked = (document.getElementById("theme-toggle") as HTMLInputElement | null)?.checked ?? false;
				iframe.contentWindow?.postMessage(
					{
						giscus: {
							setConfig: {
								theme: checked ? "light" : "dark",
							},
						},
					},
					"https://giscus.app"
				);
			}
		}

		document.addEventListener("change", onThemeChange);

		return () => {
			script.remove();
			document.removeEventListener("change", onThemeChange);
		};
	}, [lang, mounted]);

	return <div ref={ref} className="giscus-comments" />;
}
