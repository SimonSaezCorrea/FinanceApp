import { describe, expect, it } from "vitest";

import { LEGACY_REDIRECTS, legacyTarget, pagePath, pickLanguage } from "./language";

describe("pickLanguage", () => {
  it("picks English when the browser prefers it first", () => {
    expect(pickLanguage(["en-US", "es"])).toBe("en");
    expect(pickLanguage(["en"])).toBe("en");
  });

  it("picks Spanish for Spanish or anything else", () => {
    expect(pickLanguage(["es-CL", "en"])).toBe("es");
    expect(pickLanguage(["fr-FR"])).toBe("es");
  });

  it("falls back to Spanish when nothing is known", () => {
    expect(pickLanguage([])).toBe("es");
    expect(pickLanguage(undefined)).toBe("es");
  });
});

describe("pagePath", () => {
  it("prefixes the language, uses the English slug in both, and ends with a slash", () => {
    expect(pagePath("es", "home")).toBe("/es/");
    expect(pagePath("en", "pricing")).toBe("/en/pricing/");
    expect(pagePath("es", "faq")).toBe("/es/faq/");
  });
});

describe("legacyTarget", () => {
  it.each([
    ["/precios", "/es/pricing/"],
    ["/nosotros", "/es/about/"],
    ["/privacidad", "/es/privacy/"],
    ["/preguntas", "/es/faq/"],
  ])("sends %s to %s", (from, to) => {
    expect(legacyTarget(from)).toBe(to);
  });

  it("knows exactly the four old addresses", () => {
    expect(Object.keys(LEGACY_REDIRECTS).sort()).toEqual([
      "/nosotros",
      "/precios",
      "/preguntas",
      "/privacidad",
    ]);
  });
});
