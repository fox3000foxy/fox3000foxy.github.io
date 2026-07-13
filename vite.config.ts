import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		// VitePWA({
		//   registerType: 'autoUpdate',
		//   includeAssets: ['icons/*.png', 'manifest.json'],
		//   manifest: {
		//     name: "Fox's Blog",
		//     short_name: 'FoxBlog',
		//     description: 'A blog about code, games, and reverse engineering',
		//     theme_color: '#000000',
		//     background_color: '#000000',
		//     display: 'standalone',
		//     scope: '/',
		//     start_url: '/',
		//     categories: ['blog', 'technology', 'gaming'],
		//     orientation: 'any',
		//     icons: [
		//       { src: '/icons/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
		//       { src: '/icons/android-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
		//     ],
		//   },
		//   workbox: {
		//     globPatterns: ['**/*.{js,css,html,md,xml,json,ico,png,svg,txt}'],
		//     globIgnores: ['**/articles/assets/*.png', '**/assets/vendor-*.js'],
		//     maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
		//   },
		// }),
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
						return "vendor";
					}
				},
			},
		},
	},
});
