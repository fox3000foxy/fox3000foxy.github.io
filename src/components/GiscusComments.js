import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
const GISCUS_CONFIG = {
    repo: "fox3000foxy/fox3000foxy.github.io",
    repoId: "R_kgDORhZXLg",
    category: "Announcements",
    categoryId: "DIC_kwDORhZXLs4C-FFI",
};
export default function GiscusComments({ lang }) {
    const ref = useRef(null);
    const { theme } = useTheme();
    // biome-ignore lint/correctness/useExhaustiveDependencies: theme only used for initial render; updates via postMessage below
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
        script.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
        script.setAttribute("data-lang", lang);
        ref.current?.appendChild(script);
        return () => {
            script.remove();
        };
    }, [lang]);
    useEffect(() => {
        const iframe = ref.current?.querySelector("iframe");
        if (iframe) {
            iframe.contentWindow?.postMessage({
                giscus: {
                    setConfig: {
                        theme: theme === "dark" ? "dark" : "light",
                    },
                },
            }, "https://giscus.app");
        }
    }, [theme]);
    return _jsx("div", { ref: ref, className: "giscus-comments" });
}
