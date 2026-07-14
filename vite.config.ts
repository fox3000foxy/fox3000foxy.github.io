import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

function removeMermaidPreload(): Plugin {
	return {
		name: "remove-mermaid-preload",
		enforce: "post",
		transformIndexHtml(html) {
			return html.replace(
				/<link rel="modulepreload"[^>]*href="[^"]*mermaid[^"]*"[^>]*>/g,
				""
			);
		},
	};
}

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		removeMermaidPreload(),
		// VitePWA({...
	],
	build: {
		chunkSizeWarningLimit: 800,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
						if (
							id.includes("mermaid") ||
							id.includes("d3") ||
							id.includes("dagre") ||
							id.includes("khroma") ||
							id.includes("dompurify") ||
							id.includes("cytoscape") ||
							id.includes("marked") ||
							id.includes("stylis") ||
							id.includes("ts-dedent") ||
							id.includes("uuid")
						) {
							return "mermaid";
						}
						if (id.includes("react-dom") || id.includes("react/") || id.includes("scheduler")) {
							return "vendor-core";
						}
						if (
							id.includes("react-router") ||
							id.includes("react-markdown") ||
							id.includes("remark-") ||
							id.includes("rehype-") ||
							id.includes("hast-") ||
							id.includes("unified") ||
							id.includes("highlight.js") ||
							id.includes("property-information") ||
							id.includes("space-separated-tokens") ||
							id.includes("comma-separated-tokens") ||
							id.includes("html-void-elements") ||
							id.includes("micromark") ||
							id.includes("decode-named-character-reference") ||
							id.includes("character-entities") ||
							id.includes("trim-lines") ||
							id.includes("lowlight") ||
							id.includes("refractor") ||
							id.includes("fault") ||
							id.includes("ccount") ||
							id.includes("escape-string-regexp") ||
							id.includes("@tiptap")
						) {
							return "vendor-content";
						}
						return "vendor-other";
					}
				},
			},
		},
	},
});
