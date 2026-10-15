import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGACY_REDIRECTS } from "./language";
import { acceptedLanguages, rootRedirect } from "./rootRedirect";

const at = (path: string, acceptLanguage?: string) =>
  rootRedirect(
    new Request(`https://mifik.cl${path}`, {
      headers: acceptLanguage ? { "Accept-Language": acceptLanguage } : {},
    }),
  );

describe("acceptedLanguages", () => {
  it("orders by weight, keeping the header's order on ties", () => {
    expect(acceptedLanguages("es-CL,es;q=0.9,en;q=0.8")).toEqual(["es-cl", "es", "en"]);
    expect(acceptedLanguages("es;q=0.5, en-US")).toEqual(["en-us", "es"]);
    expect(acceptedLanguages("fr, de")).toEqual(["fr", "de"]);
  });

  it("drops the wildcard, refused languages and junk", () => {
    expect(acceptedLanguages("*, en;q=0, es;q=abc")).toEqual([]);
    expect(acceptedLanguages(null)).toEqual([]);
    expect(acceptedLanguages("")).toEqual([]);
  });
});

describe("rootRedirect", () => {
  it("sends an English browser to /en/ and anyone else to /es/, with a 302", () => {
    expect(at("/", "en-US,en;q=0.9").headers.get("Location")).toBe("/en/");
    expect(at("/", "es-CL,es;q=0.9,en;q=0.8").headers.get("Location")).toBe("/es/");
    expect(at("/", "fr-FR").headers.get("Location")).toBe("/es/");
    const response = at("/");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/es/");
  });

  it("keeps the query, so the access panel still opens on arrival", () => {
    expect(at("/?acceso=login&volver=%2Faccounts", "en").headers.get("Location")).toBe(
      "/en/?acceso=login&volver=%2Faccounts",
    );
  });

  it("varies on the language and is never kept by a shared cache", () => {
    const response = at("/", "en");
    expect(response.headers.get("Vary")).toBe("Accept-Language");
    expect(response.headers.get("Cache-Control")).toContain("private");
  });
});

describe("public/_redirects", () => {
  const rules = readFileSync(join(__dirname, "../../public/_redirects"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));

  it("moves every old address permanently, with and without the trailing slash", () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(rules).toContainEqual([from, to, "301"]);
      expect(rules).toContainEqual([`${from}/`, to, "301"]);
    }
    expect(rules).toHaveLength(Object.keys(LEGACY_REDIRECTS).length * 2);
  });

  it("leaves the root to the Pages Function", () => {
    expect(rules.some(([from]) => from === "/")).toBe(false);
  });
});
