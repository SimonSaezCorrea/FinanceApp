import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// The public site (specs/031): plain static files, publishable on any static host.
// `site` is the canonical origin used for canonical/hreflang/og:url and the sitemap.
const site = process.env.PUBLIC_SITE_URL ?? "http://localhost:4321";

// Pages that only redirect: the root (picks the language) and the old Spanish addresses.
const REDIRECT_PAGES = new Set(["/", "/precios/", "/nosotros/", "/privacidad/", "/preguntas/"]);

// Pages an email link opens (specs/032): never indexed, never in the sitemap.
const EMAIL_LINK_PAGES = /^\/(es|en)\/(verify-email|reset-password)\/$/;

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  // The site's CSS (~11 KB) goes inside each page instead of a separate file: it was the one
  // render-blocking request Lighthouse flagged (~200-330 ms on mobile).
  build: { format: "directory", inlineStylesheets: "always" },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !REDIRECT_PAGES.has(path) && !EMAIL_LINK_PAGES.test(path);
      },
      i18n: { defaultLocale: "es", locales: { es: "es-CL", en: "en-US" } },
    }),
  ],
  vite: {
    // One React for the whole page (pnpm can surface a second copy through workspace packages).
    resolve: { dedupe: ["react", "react-dom"] },
  },
});
