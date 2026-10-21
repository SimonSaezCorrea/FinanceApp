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
            expect(html).toContain('href="https://mindicador.cl"');
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

  it("redirects the root and the old addresses", () => {
    expect(readFileSync(join(DIST, "index.html"), "utf8")).toMatch(
      /http-equiv="refresh"[^>]*\/es\//,
    );
    expect(readFileSync(join(DIST, "precios", "index.html"), "utf8")).toContain("/es/pricing/");
  });
});
