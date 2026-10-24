import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { guideSitemapPairs } from "./sitemapPairs.mjs";

function contentDir(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "guides-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const md = (address: string) =>
  `---\ntitle: "T"\naddress: "${address}"\n---\n\nBody address: not-this\n`;

describe("guideSitemapPairs (spec 035)", () => {
  it("pairs each guide's Spanish and English addresses from their frontmatter address", () => {
    const root = contentDir({
      "statement-dates/es.md": md("fecha-de-cierre-tarjeta"),
      "statement-dates/en.md": md("credit-card-statement-dates"),
    });
    expect(guideSitemapPairs(root)).toEqual([
      { es: "/es/guias/fecha-de-cierre-tarjeta/", en: "/en/guides/credit-card-statement-dates/" },
    ]);
  });

  it("gives no pair to a guide written in one language", () => {
    const root = contentDir({ "only-es/es.md": md("solo-espanol") });
    expect(guideSitemapPairs(root)).toEqual([]);
  });

  it("reads an unquoted address too", () => {
    const root = contentDir({
      "a/es.md": "---\naddress: uno\n---\n",
      "a/en.md": "---\naddress: one\n---\n",
    });
    expect(guideSitemapPairs(root)).toEqual([{ es: "/es/guias/uno/", en: "/en/guides/one/" }]);
  });

  it("is empty when there is no guides folder", () => {
    expect(guideSitemapPairs(join(tmpdir(), "does-not-exist-guides"))).toEqual([]);
  });
});
