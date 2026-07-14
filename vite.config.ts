import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		// VitePWA({...
	],
	build: {
		chunkSizeWarningLimit: 800,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
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
