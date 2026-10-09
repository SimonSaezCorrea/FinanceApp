import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What a crawler or a first visit gets (specs/031 US1, SC-001/SC-002): runs over `dist/` after
 * `astro build`, with the site built for `http://localhost:4321` unless PUBLIC_SITE_URL says
 * otherwise.
 */
const DIST = join(import.meta.dirname, "..", "dist");
const SITE = (process.env.PUBLIC_SITE_URL ?? "http://localhost:4321").replace(/\/+$/, "");

const PAGES = [
  { slug: "", h1: "landing-home-title" },
  { slug: "about", h1: "landing-about-title" },
  { slug: "privacy", h1: "landing-privacy-title" },
  { slug: "pricing", h1: "landing-pricing-title" },
  { slug: "faq", h1: "landing-faq-title" },
] as const;
const LANGS = ["es", "en"] as const;

const htmlOf = (lang: string, slug: string) =>
  readFileSync(join(DIST, lang, slug, "index.html"), "utf8");
const attr = (html: string, pattern: RegExp) => html.match(pattern)?.[1] ?? null;
const title = (html: string) => attr(html, /<title>([^<]*)<\/title>/);
const description = (html: string) => attr(html, /<meta name="description" content="([^"]*)"/);

describe("public site build", () => {
  it("built", () => {
    expect(existsSync(DIST)).toBe(true);
  });

  for (const lang of LANGS) {
    for (const { slug, h1 } of PAGES) {
      const path = `/${lang}/${slug}`;
      describe(path, () => {
        const html = htmlOf(lang, slug);
        const canonical = slug ? `${SITE}/${lang}/${slug}/` : `${SITE}/${lang}/`;

        it("declares its language, title and description", () => {
          expect(html).toMatch(new RegExp(`<html[^>]* lang="${lang}"`));
          expect(title(html)).toBeTruthy();
          expect(description(html)).toBeTruthy();
        });

        it("has its canonical and both language alternates plus x-default", () => {
          expect(html).toContain(`<link rel="canonical" href="${canonical}"`);
          expect(html).toMatch(/hreflang="es"/);
          expect(html).toMatch(/hreflang="en"/);
          expect(html).toContain(`hreflang="x-default" href="${SITE}/"`);
        });

        it("has a preview for social networks", () => {
          expect(html).toContain(
            `<meta property="og:image" content="${SITE}/og/cuadra-${lang}.png"`,
          );
          expect(html).toMatch(/<meta property="og:locale" content="(es_CL|en_US)"/);
          expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
        });

        it("delivers its heading in the HTML itself", () => {
          expect(html).toMatch(new RegExp(`<h1[^>]*id="${h1}"`));
        });

        it("loads no React and nothing from the app on arrival", () => {
          const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]!);
          for (const src of scripts) {
            const code = readFileSync(join(DIST, src), "utf8");
            expect(code, src).not.toMatch(/react-dom|__reactFiber|react\.production/);
          }
          expect(html).not.toMatch(/astro-island/);
        });

        it("says that signing in needs JavaScript when it is off", () => {
          expect(html).toMatch(/<noscript>[\s\S]*<\/noscript>/);
        });
      });
    }
  }

  it("never repeats a title or a description across the ten pages", () => {
    const all = LANGS.flatMap((lang) => PAGES.map(({ slug }) => htmlOf(lang, slug)));
    expect(new Set(all.map(title)).size).toBe(all.length);
    expect(new Set(all.map(description)).size).toBe(all.length);
  });

  it("publishes robots.txt pointing at the sitemap", () => {
    const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
  });

  it("lists the ten pages in the sitemap, and not the redirects", () => {
    const files = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
    const xml = files.map((f) => readFileSync(join(DIST, f), "utf8")).join("\n");
    for (const lang of LANGS) {
      for (const { slug } of PAGES) {
        expect(xml).toContain(
          slug ? `<loc>${SITE}/${lang}/${slug}/</loc>` : `<loc>${SITE}/${lang}/</loc>`,
        );
      }
    }
    expect(xml).not.toContain(`${SITE}/precios`);
  });

  it("redirects the root and the old addresses", () => {
    expect(readFileSync(join(DIST, "index.html"), "utf8")).toMatch(
      /http-equiv="refresh"[^>]*\/es\//,
    );
    expect(readFileSync(join(DIST, "precios", "index.html"), "utf8")).toContain("/es/pricing/");
  });
});
