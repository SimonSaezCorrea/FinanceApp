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
  { slug: "privacy-policy", h1: "landing-privacy-policy-title" },
  { slug: "pricing", h1: "landing-pricing-title" },
  { slug: "faq", h1: "landing-faq-title" },
  { slug: "ai", h1: "landing-ai-title" },
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
          expect(html).toContain(`<meta property="og:image" content="${SITE}/og/fik-${lang}.png"`);
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

  it("never repeats a title within a language, nor a description across the ten pages", () => {
    // The home is the brand alone ("fik") in every language; hreflang already pairs them.
    for (const lang of LANGS) {
      const titles = PAGES.map(({ slug }) => title(htmlOf(lang, slug)));
      expect(new Set(titles).size).toBe(titles.length);
    }
    const all = LANGS.flatMap((lang) => PAGES.map(({ slug }) => htmlOf(lang, slug)));
    expect(new Set(all.map(description)).size).toBe(all.length);
  });

  it("never caches or refers on the email-link pages", () => {
    const headers = readFileSync(join(DIST, "_headers"), "utf8");
    for (const page of ["verify-email", "reset-password"]) {
      const rule = headers.split(/\n\s*\n/).find((block) => block.includes(`/:lang/${page}/`));
      expect(rule).toContain("Cache-Control: no-store");
      expect(rule).toContain("Referrer-Policy: no-referrer");
    }
  });

  // Brand searches ("fik", "mifik"): the home pages say what the site is called.
  for (const lang of LANGS) {
    it(`/${lang}/ declares the site name for search engines`, () => {
      const json = attr(htmlOf(lang, ""), /<script type="application\/ld\+json">([^<]*)<\/script>/);
      expect(json).toBeTruthy();
      const data = JSON.parse(json ?? "[]") as { "@type": string; name: string; url: string }[];
      const site = data.find((d) => d["@type"] === "WebSite");
      expect(site?.name).toBe("fik");
      expect(site?.url).toBe(`${SITE}/`);
    });
  }

  it("keeps structured data off the other pages", () => {
    expect(htmlOf("es", "faq")).not.toContain("application/ld+json");
  });

  // RFC 9116: where security researchers look for a contact. "Expires" is mandatory and at most a
  // year ahead: renew it (apps/landing/public/.well-known/security.txt) before it lapses.
  it("publishes a current security.txt", () => {
    const txt = readFileSync(join(DIST, ".well-known", "security.txt"), "utf8");
    expect(txt).toMatch(/^Contact: /m);
    expect(txt).toMatch(/^Policy: /m);
    const expires = new Date(txt.match(/^Expires: (.+)$/m)?.[1] ?? "");
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("publishes llms.txt with every listed page and guide, linked from the footer", () => {
    const llms = readFileSync(join(DIST, "llms.txt"), "utf8");
    expect(llms.startsWith("# fik\n\n> ")).toBe(true);
    for (const path of [
      "/es/",
      "/en/",
      "/es/pricing/",
      "/en/faq/",
      "/es/valor-uf/",
      "/en/guides/",
    ]) {
      expect(llms).toContain(`(${SITE}${path})`);
    }
    expect(llms).not.toContain("verify-email");
    expect(llms).not.toContain(" · fik](");
    for (const lang of LANGS) {
      // The footer goes to the page people read; that page shows the same text and links the file.
      expect(htmlOf(lang, "")).toContain(`href="/${lang}/ai/"`);
      const page = htmlOf(lang, "ai");
      expect(page).toContain('href="/llms.txt"');
      expect(page).toContain("data-llms-text");
      expect(page).toContain(`${SITE}/es/pricing/`);
    }
  });

  it("publishes robots.txt pointing at the sitemap", () => {
    const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
  });

  it("lists the twelve pages in the sitemap, and not the redirects", () => {
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
    expect(xml).not.toContain("verify-email");
    expect(xml).not.toContain("reset-password");
  });

  // The pages an email link opens (specs/032): never indexed, no canonical, no React on arrival.
  for (const lang of LANGS) {
    for (const slug of ["verify-email", "reset-password"]) {
      it(`/${lang}/${slug}/ is noindex with its own title`, () => {
        const html = htmlOf(lang, slug);
        expect(html).toContain(`<meta name="robots" content="noindex"`);
        expect(html).not.toContain(`rel="canonical"`);
        expect(title(html)).toMatch(/· fik$/);
        expect(html).toContain("data-state=");
        expect(html).toContain(`<meta name="referrer" content="no-referrer"`);
        // Visit statistics never run where the address carries a one-time token.
        expect(html).not.toContain("cloudflareinsights");
      });
    }
  }

  // Spec 033: the indicator pages. With EXCHANGE_RATES_SNAPSHOT set (CI builds with the fixture),
  // the exact value of the day is checked; without it, the page must show a value or the notice.
  describe("indicator pages (spec 033)", () => {
    const fixturePath = process.env.EXCHANGE_RATES_SNAPSHOT;
    const fixture = fixturePath
      ? (JSON.parse(readFileSync(join(import.meta.dirname, "..", fixturePath), "utf8")) as {
          latest: Record<"USD" | "CLF", { value: string; date: string; valueDate: string }>;
        })
      : null;
    const RATE_PAGES = [
      { currency: "CLF", es: "valor-uf", en: "uf-value" },
      { currency: "USD", es: "dolar-observado", en: "dollar-rate" },
    ] as const;
    const shown = (value: string, lang: string) =>
      `$${new Intl.NumberFormat(lang === "es" ? "es-CL" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value))}`;

    for (const lang of LANGS) {
      for (const p of RATE_PAGES) {
        const slug = p[lang];
        const other = lang === "es" ? "en" : "es";
        describe(`/${lang}/${slug}/`, () => {
          const html = htmlOf(lang, slug);

          it("has its own title, description, canonical without a query, and its real pair", () => {
            expect(html).toMatch(new RegExp(`<html[^>]* lang="${lang}"`));
            expect(title(html)).toMatch(/· fik$/);
            expect(description(html)).toBeTruthy();
            expect(html).toContain(`<link rel="canonical" href="${SITE}/${lang}/${slug}/"`);
            expect(html).toContain(`hreflang="${other}" href="${SITE}/${other}/${p[other]}/"`);
            expect(html).toMatch(/<h1[^>]*id="rate-title"/);
          });

          it("carries the value of the day in the HTML (FR-005)", () => {
            if (!fixture) {
              expect(html).toMatch(
                /data-rate-value[^>]*>\$[\d.,]+|data-rate-unavailable(?![^>]*hidden)/,
              );
              return;
            }
            const row = fixture.latest[p.currency];
            expect(html).toContain(shown(row.value, lang));
            expect(title(html)).toContain(shown(row.value, lang));
            const carried = row.valueDate < row.date;
            expect(/data-rate-carried(?![^>]*hidden)/.test(html)).toBe(carried);
          });

          it("declares the rate for search engines", () => {
            const json =
              attr(html, /<script type="application\/ld\+json">([^<]*)<\/script>/) ?? "[]";
            const types = (JSON.parse(json) as { "@type": string }[]).map((d) => d["@type"]);
            expect(types).toContain("BreadcrumbList");
            if (fixture) expect(types).toContain("ExchangeRateSpecification");
          });

          it("cites the source, links the other indicator and invites to sign up (FR-012)", () => {
            // The BDE terms: say the data are the Banco Central's property, every time they are published.
            expect(html).toContain('href="https://si3.bcentral.cl/Siete/"');
            expect(html).toMatch(
              /propiedad del Banco Central de Chile|property of the Central Bank of Chile/,
            );
            expect(html).toMatch(/href="\?acceso=registro"[^>]*data-access="registro"/);
            const otherPage = RATE_PAGES.find((o) => o !== p)!;
            expect(html).toContain(`href="/${lang}/${otherPage[lang]}/"`);
          });

          it("ships the history, the date input and the converter (FR-008/009/010)", () => {
            if (fixture) {
              expect(html.match(/<svg[^>]*data-rate-chart/g)?.length).toBe(2);
              expect(html).toMatch(/<tbody data-period="30"[^>]*>\s*<tr[\s>]/);
              expect(html).toMatch(/<input[^>]*data-rate-date-input[^>]*min="\d{4}-\d{2}-\d{2}"/);
              expect(html).toContain('id="rates-data"');
            }
            expect(html).toContain("data-conv-unit");
            expect(html).toContain("data-conv-pesos");
          });

          it("loads no React on arrival", () => {
            const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]!);
            for (const src of scripts) {
              const code = readFileSync(join(DIST, src), "utf8");
              expect(code, src).not.toMatch(/react-dom|__reactFiber|react\.production/);
            }
          });
        });
      }

      it(`/${lang}/ shows today's UF and dollar, linking to their pages (FR-013)`, () => {
        const html = htmlOf(lang, "");
        for (const p of RATE_PAGES) {
          expect(html).toContain(`href="/${lang}/${p[lang]}/"`);
          if (fixture) expect(html).toContain(shown(fixture.latest[p.currency].value, lang));
        }
      });

      it(`every /${lang}/ page links to both indicators in its footer`, () => {
        for (const slug of ["about", "faq", "pricing"]) {
          const html = htmlOf(lang, slug);
          for (const p of RATE_PAGES) expect(html).toContain(`href="/${lang}/${p[lang]}/"`);
        }
      });
    }

    it("lists the four pages in the sitemap with their real language pair", () => {
      const files = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
      const xml = files.map((f) => readFileSync(join(DIST, f), "utf8")).join("\n");
      for (const p of RATE_PAGES) {
        for (const lang of LANGS) expect(xml).toContain(`<loc>${SITE}/${lang}/${p[lang]}/</loc>`);
        expect(xml).not.toContain(`${SITE}/en/${p.es}/`);
        expect(xml).not.toContain(`${SITE}/es/${p.en}/`);
      }
    });
  });

  // Spec 035: the guides section. One guide for now, in both languages (contracts/pages.md).
  describe("guides (spec 035)", () => {
    const INDEX = { es: "guias", en: "guides" } as const;
    const GUIDE = {
      es: "guias/fecha-de-cierre-tarjeta",
      en: "guides/credit-card-statement-dates",
    } as const;
    const jsonLdTypes = (html: string) => {
      const json = attr(html, /<script type="application\/ld\+json">([^<]*)<\/script>/) ?? "[]";
      return (JSON.parse(json) as { "@type": string }[]).map((d) => d["@type"]);
    };
    const jsonLd = (html: string) =>
      JSON.parse(
        attr(html, /<script type="application\/ld\+json">([^<]*)<\/script>/) ?? "[]",
      ) as Record<string, unknown>[];

    for (const lang of LANGS) {
      const other = lang === "es" ? "en" : "es";

      describe(`/${lang}/${GUIDE[lang]}/`, () => {
        const html = htmlOf(lang, GUIDE[lang]);

        it("offers its Markdown for AI: a .md next to it and the same text to copy", () => {
          const md = readFileSync(join(DIST, lang, `${GUIDE[lang]}.md`), "utf8");
          expect(md.startsWith("# ")).toBe(true);
          expect(md).toContain(`- URL: ${SITE}/${lang}/${GUIDE[lang]}/`);
          expect(html).toContain("data-guide-ai");
          expect(html).toContain(`href="/${lang}/${GUIDE[lang]}.md"`);
          const island = attr(
            html,
            /<script type="application\/json" data-llms-text>([^<]*)<\/script>/,
          );
          expect(JSON.parse(island ?? '""')).toBe(md);
        });

        it("has its own title, description, canonical and its pair (FR-002, FR-011)", () => {
          expect(html).toMatch(new RegExp(`<html[^>]* lang="${lang}"`));
          expect(title(html)).toMatch(/· fik$/);
          expect(description(html)?.length).toBeGreaterThan(40);
          expect(html).toContain(`<link rel="canonical" href="${SITE}/${lang}/${GUIDE[lang]}/"`);
          expect(html).toContain(`hreflang="${other}" href="${SITE}/${other}/${GUIDE[other]}/"`);
          expect(html).toMatch(/<h1[^>]*id="guide-title"/);
        });

        it("answers first, with dates, author and a table of contents (FR-003, FR-005, FR-007)", () => {
          // The body opens with the answer: a paragraph, before any heading.
          expect(html).toMatch(/<div[^>]*data-guide-body[^>]*>\s*<p>[^<]{60,}/);
          expect(html.match(/<time datetime="\d{4}-\d{2}-\d{2}"/g)?.length).toBeGreaterThanOrEqual(
            2,
          );
          expect(html).toMatch(
            new RegExp(`data-guide-author><a href="/${lang}/about/#author"[^>]*>Simón Sáez</a>, `),
          );
          // The table of contents covers the guide's own sections (the body's h2), not the page's.
          const body = html.slice(
            html.indexOf("data-guide-body"),
            html.indexOf("data-guide-sources"),
          );
          const ids = [...body.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]!);
          expect(ids.length).toBeGreaterThanOrEqual(3);
          for (const id of ids) expect(html).toContain(`href="#${id}"`);
        });

        it("cites official sources, warns it is general information and shows how in fik (FR-006, FR-008, FR-009)", () => {
          expect(html).toMatch(/data-guide-sources[\s\S]*?<a href="https:\/\//);
          expect(html).toMatch(/data-guide-notice/);
          // The brand is italic in running text (CLAUDE.md conventions): "fik" may be wrapped in <em>.
          expect(html).toMatch(/<h2 id="[^"]+">(Cómo lo haces en|How to do it in) (<em>)?fik/);
          expect(html).toMatch(
            /data-access-slot[^>]*>\s*<a href="\?acceso=registro" data-access="registro"[\s\S]*?<template data-app-template>/,
          );
          expect(html).toContain(`href="/${lang}/${INDEX[lang]}/"`);
        });

        it("declares an Article for search engines (FR-011)", () => {
          expect(jsonLdTypes(html)).toEqual(["Article", "BreadcrumbList"]);
          const article = jsonLd(html)[0]!;
          expect(article.inLanguage).toBe(lang === "es" ? "es-CL" : "en-US");
          expect(article.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(article.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          const author = article.author as { "@type": string; name: string; url: string };
          expect(author["@type"]).toBe("Person");
          expect(author.name).toBe("Simón Sáez");
          expect(author.url).toBe(`${SITE}/${lang}/about/#author`);
          // …where that address lands: the author block on the About page.
          const about = readFileSync(join(DIST, lang, "about", "index.html"), "utf8");
          expect(about).toMatch(/<section id="author"[^>]*>[\s\S]*?Simón Sáez/);
        });

        it("reads without JavaScript: only the layout's and the copy button's scripts, no React (FR-010)", () => {
          const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]!);
          expect(
            scripts.every((src) => src.includes("PageLayout") || src.includes("GuideAiTools")),
          ).toBe(true);
          for (const src of scripts) {
            const code = readFileSync(join(DIST, src), "utf8");
            expect(code, src).not.toMatch(/react-dom|__reactFiber|react\.production/);
          }
        });

        it("switches language to its pair, never to a missing page", () => {
          expect(html).toMatch(
            new RegExp(`href="/${other}/${GUIDE[other]}/"[^>]*hreflang="${other}"`),
          );
        });
      });

      describe(`/${lang}/${INDEX[lang]}/`, () => {
        const html = htmlOf(lang, INDEX[lang]);

        it("lists the guide with its summary and review date (FR-012)", () => {
          expect(html).toMatch(/<h1[^>]*id="guides-title"/);
          expect(html).toContain(`href="/${lang}/${GUIDE[lang]}/"`);
          expect(html).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}"/);
          expect(html).toContain(`<link rel="canonical" href="${SITE}/${lang}/${INDEX[lang]}/"`);
          expect(html).toContain(`hreflang="${other}" href="${SITE}/${other}/${INDEX[other]}/"`);
          expect(jsonLdTypes(html)).toEqual(["CollectionPage", "BreadcrumbList"]);
        });
      });

      it(`every /${lang}/ page links to the guides in its footer, and the FAQ too (FR-013)`, () => {
        for (const slug of ["", "about", "faq", "pricing", GUIDE[lang]]) {
          expect(htmlOf(lang, slug)).toContain(`href="/${lang}/${INDEX[lang]}/"`);
        }
        expect(htmlOf(lang, "faq")).toMatch(
          new RegExp(
            `data-faq-guides[^>]*href="/${lang}/${INDEX[lang]}/"|href="/${lang}/${INDEX[lang]}/"[^>]*data-faq-guides`,
          ),
        );
      });
    }

    it("titles and descriptions of the guide pages are unique", () => {
      const pages = LANGS.flatMap((lang) => [htmlOf(lang, INDEX[lang]), htmlOf(lang, GUIDE[lang])]);
      expect(new Set(pages.map(title)).size).toBe(pages.length);
      expect(new Set(pages.map(description)).size).toBe(pages.length);
    });

    it("lists the indexes and the guide in the sitemap with their real language pair", () => {
      const files = readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
      const xml = files.map((f) => readFileSync(join(DIST, f), "utf8")).join("\n");
      for (const page of [INDEX, GUIDE]) {
        for (const lang of LANGS)
          expect(xml).toContain(`<loc>${SITE}/${lang}/${page[lang]}/</loc>`);
        expect(xml).toContain(`hreflang="en-US" href="${SITE}/en/${page.en}/"`);
        expect(xml).not.toContain(`${SITE}/en/${page.es}/`);
      }
    });
  });

  it("redirects the root and the old addresses", () => {
    expect(readFileSync(join(DIST, "index.html"), "utf8")).toMatch(
      /http-equiv="refresh"[^>]*\/es\//,
    );
    expect(readFileSync(join(DIST, "precios", "index.html"), "utf8")).toContain("/es/pricing/");
  });
});
