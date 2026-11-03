import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chileDay,
  compareVersions,
  FIRST_VERSION,
  nextVersion,
  parseVersion,
  versionSlug,
} from "../scripts/version-rules.mjs";
import { assignVersions, resolveVersions } from "../scripts/versions.mjs";

describe("version rules", () => {
  it("reads and orders versions numerically", () => {
    expect(parseVersion("v1.2")).toEqual([1, 2]);
    expect(parseVersion("1.10")).toEqual([1, 10]);
    expect(parseVersion("2026-11-01-x")).toBeNull();
    expect(compareVersions("1.10", "1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.1", "1.1")).toBe(0);
    expect(compareVersions("1.1", null)).toBeGreaterThan(0);
  });

  it("starts at v1.1 (v1.0 is the launch) and counts up", () => {
    expect(FIRST_VERSION).toBe("1.1");
    expect(nextVersion(null)).toBe("1.1");
    expect(nextVersion("1.0")).toBe("1.1");
    expect(nextVersion("1.1")).toBe("1.2");
    expect(nextVersion("1.9")).toBe("1.10");
  });

  it("names the address piece and Chile's day", () => {
    expect(versionSlug("1.2")).toBe("v1-2");
    // 02:00 UTC on 3 November is still the 2nd in Santiago.
    expect(chileDay(new Date("2026-11-03T02:00:00Z"))).toBe("2026-11-02");
  });
});

describe("assignVersions", () => {
  const trees: Record<string, string[]> = {
    "1.1": ["guias", "novedades"],
    "1.2": ["guias", "novedades", "plantillas"],
    "1.3": ["guias", "novedades", "plantillas"],
  };

  it("puts each record in the first tag that has it and the rest in the next version", () => {
    const versions = assignVersions({
      current: ["guias", "novedades", "plantillas", "tarjeta"],
      tags: [
        { version: "1.1", date: "2026-10-26" },
        { version: "1.2", date: "2026-11-02" },
        { version: "1.3", date: "2026-11-05" },
      ],
      recordsAtTag: (v) => trees[v] ?? [],
      today: "2026-11-09",
    });
    // v1.3 brought no new record, so it isn't listed.
    expect(versions).toEqual([
      { version: "1.4", date: "2026-11-09", pending: true, records: ["tarjeta"] },
      { version: "1.2", date: "2026-11-02", pending: false, records: ["plantillas"] },
      { version: "1.1", date: "2026-10-26", pending: false, records: ["guias", "novedades"] },
    ]);
  });

  it("orders a version's records newest first, then by name", () => {
    const [only] = assignVersions({
      current: ["a", "b", "c"],
      tags: [],
      recordsAtTag: () => [],
      today: "2026-11-02",
      addedAt: new Map([
        ["a", 100],
        ["b", 200],
      ]),
    });
    expect(only!.records).toEqual(["c", "b", "a"]);
    expect(only!.version).toBe("1.1");
  });

  it("drops a record deleted since its tag", () => {
    const versions = assignVersions({
      current: ["b"],
      tags: [{ version: "1.1", date: "2026-10-26" }],
      recordsAtTag: () => ["a", "b"],
      today: "2026-11-02",
    });
    expect(versions).toEqual([
      { version: "1.1", date: "2026-10-26", pending: false, records: ["b"] },
    ]);
  });
});

describe("resolveVersions", () => {
  it("reads the version tags of a real repository", () => {
    const repo = mkdtempSync(join(tmpdir(), "fik-versions-"));
    try {
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" });
      const root = join(repo, "packages/release-notes/releases");
      const add = (id: string) => {
        mkdirSync(join(root, id), { recursive: true });
        writeFileSync(join(root, id, "es.md"), "---\ntitle: x\n---\n");
      };
      git("init", "-q");
      git("config", "user.email", "t@test.local");
      git("config", "user.name", "t");
      add("guias");
      git("add", ".");
      git("commit", "-qm", "docs(release): guias");
      git("tag", "-a", "v1.1", "-m", "fik v1.1 · 2026-10-26");
      add("plantillas");
      git("add", ".");
      git("commit", "-qm", "docs(release): plantillas");

      expect(resolveVersions({ root, today: "2026-11-02", warn: () => {} })).toEqual([
        { version: "1.2", date: "2026-11-02", pending: true, records: ["plantillas"] },
        { version: "1.1", date: "2026-10-26", pending: false, records: ["guias"] },
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to one new version when the folder isn't in git", () => {
    const warnings: string[] = [];
    const versions = resolveVersions({
      root: "/definitely/not/a/repo",
      today: "2026-11-02",
      warn: (m) => warnings.push(m),
    });
    expect(versions).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
