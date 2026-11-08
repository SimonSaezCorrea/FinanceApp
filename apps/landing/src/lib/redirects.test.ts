import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGACY_REDIRECTS } from "./language";

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

  it("never redirects the root: it is the Spanish home", () => {
    expect(rules.some(([from]) => from === "/")).toBe(false);
  });
});
