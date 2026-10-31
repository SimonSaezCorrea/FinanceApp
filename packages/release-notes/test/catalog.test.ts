import { describe, expect, it } from "vitest";

import { releaseCatalog, releasesIn } from "../src/catalog";
import { hasUnseen, latestReleaseId, loadReleases, releaseIds } from "../src/lazy";

describe("the repository's records", () => {
  it("are all valid, in both languages", () => {
    const records = releaseCatalog();
    expect(records.length).toBeGreaterThan(0);
    expect(records.map((r) => r.id)).toContain("2026-10-26-guias-chile");
    for (const lang of ["es", "en"] as const) {
      expect(releasesIn(records, lang).every((r) => r.lang === lang)).toBe(true);
    }
  });

  it("the lazy view sees the same ids and loads the same text", async () => {
    const ids = releaseCatalog().map((r) => r.id);
    expect(releaseIds()).toEqual(ids);
    expect(latestReleaseId()).toBe(ids[0]);
    const en = await loadReleases("en");
    expect(en.map((r) => r.id)).toEqual(ids);
    expect(en[0]!.lang).toBe("en");
  });
});

describe("hasUnseen", () => {
  it("is true until the newest was seen", () => {
    expect(hasUnseen("2026-10-26-a", null)).toBe(true);
    expect(hasUnseen("2026-10-26-a", undefined)).toBe(true);
    expect(hasUnseen("2026-10-26-b", "2026-10-26-a")).toBe(true);
    expect(hasUnseen("2026-10-26-a", "2026-10-26-a")).toBe(false);
    expect(hasUnseen("2026-10-26-a", "2026-11-01-z")).toBe(false);
    expect(hasUnseen(null, null)).toBe(false);
  });
});
