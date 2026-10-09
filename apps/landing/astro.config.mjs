import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// The public site (specs/031): plain static files, publishable on any static host.
// `site` is the canonical origin used for canonical/hreflang/og:url and the sitemap.
const site = process.env.PUBLIC_SITE_URL ?? "http://localhost:4321";

// Pages that only redirect: the root (picks the language) and the old Spanish addresses.
const REDIRECT_PAGES = new Set(["/", "/precios/", "/nosotros/", "/privacidad/", "/preguntas/"]);

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !REDIRECT_PAGES.has(new URL(page).pathname),
      i18n: { defaultLocale: "es", locales: { es: "es-CL", en: "en-US" } },
    }),
  ],
  vite: {
    // One React for the whole page (pnpm can surface a second copy through workspace packages).
    resolve: { dedupe: ["react", "react-dom"] },
  },
});
