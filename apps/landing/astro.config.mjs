import { fileURLToPath } from "node:url";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import { guideSitemapPairs } from "./src/domains/guides/lib/sitemapPairs.mjs";

// The public site (specs/031): plain static files, publishable on any static host.
// `site` is the canonical origin used for canonical/hreflang/og:url and the sitemap.
const site = process.env.PUBLIC_SITE_URL ?? "http://localhost:4321";

// Pages that only redirect: the root (picks the language) and the old Spanish addresses.
const REDIRECT_PAGES = new Set(["/", "/precios/", "/nosotros/", "/privacidad/", "/preguntas/"]);

// The indicator pages (spec 033) and the guides (spec 035) have a different slug per language; the
// sitemap's i18n option pairs pages by swapping the language segment, so their alternates are
// rewritten from this table. Same pages as LOCALIZED_SLUGS in src/lib/language.ts
// (test/build.test.ts checks the sitemap).
const LOCALIZED_PAIRS = [
  { es: "/es/valor-uf/", en: "/en/uf-value/" },
  { es: "/es/dolar-observado/", en: "/en/dollar-rate/" },
  { es: "/es/guias/", en: "/en/guides/" },
  { es: "/es/como-escribimos/", en: "/en/how-we-write/" },
  // Every guide written in both languages (spec 035), read from its frontmatter slug.
  ...guideSitemapPairs(fileURLToPath(new URL("./src/content/guides", import.meta.url))),
];

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
      serialize(item) {
        const path = new URL(item.url).pathname;
        const pair = LOCALIZED_PAIRS.find((p) => p.es === path || p.en === path);
        if (pair) {
          item.links = [
            { url: new URL(pair.es, site).href, lang: "es-CL" },
            { url: new URL(pair.en, site).href, lang: "en-US" },
          ];
        }
        return item;
      },
    }),
  ],
  vite: {
    // One React for the whole page (pnpm can surface a second copy through workspace packages).
    resolve: { dedupe: ["react", "react-dom"] },
    // The access panel is a dynamic import (scripts/access.ts), so Vite's startup scan never sees
    // its dependencies: in `dev`, the first click discovered them, re-optimized mid-session and the
    // import failed with 504 "Outdated Optimize Dep" — the panel never opened. Bundle them upfront.
    optimizeDeps: {
      include: [
        "i18next",
        "react-i18next",
        "clsx",
        "tailwind-merge",
        "lucide-react",
        "@radix-ui/react-dialog",
      ],
    },
  },
});
