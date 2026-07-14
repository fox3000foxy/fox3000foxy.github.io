import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

const SITE_URL = "https://fox3000foxy.com";

export default defineConfig({
  site: SITE_URL,
  output: "static",
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes("/write") && !page.includes("/legacy"),
    }),
  ],
  i18n: {
    locales: ["en", "fr", "de", "es", "pt", "it", "ru", "ja", "ko", "zh", "ar", "hi", "id", "th", "tr", "vi"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  build: {
    format: "directory",
  },
});
