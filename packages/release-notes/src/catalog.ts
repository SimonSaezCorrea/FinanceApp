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

/** One deploy in both languages. */
export interface ReleaseRecord {
  id: string;
  date: string;
  commits: string[];
  byLanguage: Record<ReleaseLanguage, Release>;
}

/** Every record, checked as a set (both languages present), newest first. Throws naming the file. */
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
    records.push({ id, date: byLanguage.es.date, commits: byLanguage.es.commits, byLanguage });
  }
  return records.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** One language's records, newest first. */
export function releasesIn(records: readonly ReleaseRecord[], lang: ReleaseLanguage): Release[] {
  return records.map((r) => r.byLanguage[lang]);
}

const FILES = import.meta.glob<string>("../releases/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

let cached: ReleaseRecord[] | null = null;

/** The repository's records (eager: for the public site, at build time). */
export function releaseCatalog(): ReleaseRecord[] {
  cached ??= buildCatalog(Object.entries(FILES).map(([path, raw]) => ({ path, raw })));
  return cached;
}
