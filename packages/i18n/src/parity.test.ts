import { describe, expect, it } from "vitest";

import en from "./en.json";
import es from "./es.json";

/** Every leaf key path of a catalog, e.g. `transactions.detail.duplicate`. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * Both catalogs must carry the SAME keys (Principle III). A mechanism rather
 * than discipline: a missing translation used to surface only as a raw key
 * appearing on screen in one language.
 */
describe("i18n catalogs", () => {
  it("es and en declare identical key sets", () => {
    const esKeys = new Set(keyPaths(es));
    const enKeys = new Set(keyPaths(en));

    const missingInEn = [...esKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInEs = [...enKeys].filter((k) => !esKeys.has(k)).sort();

    expect({ missingInEn, missingInEs }).toEqual({ missingInEn: [], missingInEs: [] });
  });
});
