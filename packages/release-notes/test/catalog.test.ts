import { describe, expect, it } from "vitest";

import { groupByVersion, releasesIn, versionCatalog, type ReleaseRecord } from "../src/catalog";
import { hasUnseen, isNewerThanSeen, latestVersion, loadVersions } from "../src/lazy";

describe("the repository's records", () => {
  it("are all valid, in both languages, each in one version", () => {
    const versions = versionCatalog();
    expect(versions.length).toBeGreaterThan(0);
    const ids = versions.flatMap((v) => v.records.map((r) => r.id));
    expect(ids).toContain("guias-chile");
    expect(new Set(ids).size).toBe(ids.length);
    for (const lang of ["es", "en"] as const) {
      expect(releasesIn(versions[0]!, lang).every((r) => r.lang === lang)).toBe(true);
    }
  });

  it("the lazy view sees the same versions and loads the same text", async () => {
    const versions = versionCatalog();
    expect(latestVersion()).toBe(versions[0]!.version);
    const en = await loadVersions("en");
    expect(en.map((v) => v.version)).toEqual(versions.map((v) => v.version));
    expect(en[0]!.releases.map((r) => r.id)).toEqual(versions[0]!.records.map((r) => r.id));
    expect(en[0]!.releases[0]!.lang).toBe("en");
  });
});

describe("groupByVersion", () => {
  const record = (id: string) => ({ id, commits: [], byLanguage: {} }) as unknown as ReleaseRecord;

  it("keeps each version's order and puts an unnamed record in the newest", () => {
    const grouped = groupByVersion(
      [record("a"), record("b"), record("c")],
      [
        { version: "1.2", date: "2026-11-02", pending: true, records: ["b"] },
        { version: "1.1", date: "2026-10-26", pending: false, records: ["a", "gone"] },
      ],
    );
    expect(grouped.map((v) => [v.version, v.records.map((r) => r.id)])).toEqual([
      ["1.2", ["b", "c"]],
      ["1.1", ["a"]],
    ]);
  });
});

describe("hasUnseen", () => {
  it("is true until the newest version was seen, comparing numbers", () => {
    expect(hasUnseen("1.1", null)).toBe(true);
    expect(hasUnseen("1.1", undefined)).toBe(true);
    expect(hasUnseen("1.2", "1.1")).toBe(true);
    expect(hasUnseen("1.10", "1.9")).toBe(true);
    expect(hasUnseen("1.1", "1.1")).toBe(false);
    expect(hasUnseen("1.1", "1.2")).toBe(false);
    expect(hasUnseen(null, null)).toBe(false);
  });

  it("treats a record id saved before versions as nothing seen", () => {
    expect(isNewerThanSeen("1.1", "2026-11-01-plantillas")).toBe(true);
  });
});
