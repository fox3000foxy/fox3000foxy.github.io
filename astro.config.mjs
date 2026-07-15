import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

const SITE_URL = "https://fox3000foxy.com";

export default defineConfig({
  site: SITE_URL,
  output: "static",
  integrations: [
    preact({ compat: true }),
  ],
  image: {
    domains: ["avatars.githubusercontent.com"],
  },
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
  vite: {
    build: {
      minify: "esbuild",
      cssMinify: true,
    },
  },
});
