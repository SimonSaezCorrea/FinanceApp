/// <reference path="./virtual.d.ts" />
import VERSIONS from "virtual:fik-release-versions";

import {
  parseRelease,
  type Release,
  type ReleaseLanguage,
  RELEASE_LANGUAGES,
  ReleaseNoteError,
} from "./parse";

export interface ReleaseFile {
  path: string;
  raw: string;
}

/** One record in both languages. */
export interface ReleaseRecord {
  id: string;
  commits: string[];
  byLanguage: Record<ReleaseLanguage, Release>;
}

/** One version: a deploy that published records, and those records (newest first). */
export interface ReleaseVersion {
  /** `1.2` */
  version: string;
  /** `YYYY-MM-DD`, the deploy's day in Chile. */
  date: string;
  /** Not tagged yet: the version this build publishes. */
  pending: boolean;
  records: ReleaseRecord[];
}

/** Every record, checked as a set (both languages present), by id. Throws naming the file. */
export function buildCatalog(files: readonly ReleaseFile[]): ReleaseRecord[] {
  const byId = new Map<string, Partial<Record<ReleaseLanguage, Release>>>();
  for (const { path, raw } of files) {
    const release = parseRelease(path, raw);
    const entry = byId.get(release.id) ?? {};
    entry[release.lang] = release;
    byId.set(release.id, entry);
  }
  const records: ReleaseRecord[] = [];
  for (const [id, entry] of byId) {
    for (const lang of RELEASE_LANGUAGES) {
      if (!entry[lang])
        throw new ReleaseNoteError(
          `${id}/${lang}.md`,
          "missing: every record needs es.md and en.md",
        );
    }
    const byLanguage = entry as Record<ReleaseLanguage, Release>;
    records.push({ id, commits: byLanguage.es.commits, byLanguage });
  }
  return records.sort((a, b) => a.id.localeCompare(b.id));
}

/** The records grouped by version, newest version first. `versions` comes from git
 * (scripts/versions.mjs); a record it doesn't name joins the newest version. */
export function groupByVersion(
  records: readonly ReleaseRecord[],
  versions: typeof VERSIONS,
): ReleaseVersion[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const placed = new Set<string>();
  const grouped = versions.map((v) => {
    const own = v.records.flatMap((id) => {
      const record = byId.get(id);
      if (!record) return [];
      placed.add(id);
      return [record];
    });
    return { version: v.version, date: v.date, pending: v.pending, records: own };
  });
  const loose = records.filter((r) => !placed.has(r.id));
  if (loose.length > 0 && grouped[0]) grouped[0].records.push(...loose);
  return grouped.filter((v) => v.records.length > 0);
}

/** One language's records of a version. */
export function releasesIn(version: ReleaseVersion, lang: ReleaseLanguage): Release[] {
  return version.records.map((r) => r.byLanguage[lang]);
}

const FILES = import.meta.glob<string>("../releases/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

let cached: ReleaseVersion[] | null = null;

/** The repository's records by version (eager: for the public site, at build time). */
export function versionCatalog(): ReleaseVersion[] {
  cached ??= groupByVersion(
    buildCatalog(Object.entries(FILES).map(([path, raw]) => ({ path, raw }))),
    VERSIONS,
  );
  return cached;
}
