import { idsOf } from "./ids";
import { locate, parseRelease, type Release, type ReleaseLanguage } from "./parse";

/**
 * The app's view of the records (spec 038): the ids come from the folder names, known without
 * loading any file (so the "new" dot costs nothing), and the text is loaded only when Novedades
 * opens — one small chunk per file.
 */
const LOADERS = import.meta.glob<string>("../releases/*/*.md", {
  query: "?raw",
  import: "default",
});

/** Every record id, newest first. */
export function releaseIds(): string[] {
  return idsOf(Object.keys(LOADERS));
}

/** The newest record's id, or null when there is none. */
export function latestReleaseId(): string | null {
  return releaseIds()[0] ?? null;
}

/** Whether a record newer than the last one the person saw exists. */
export function hasUnseen(latest: string | null, seen: string | null | undefined): boolean {
  return latest !== null && (!seen || latest > seen);
}

/** One language's records, newest first. */
export async function loadReleases(lang: ReleaseLanguage): Promise<Release[]> {
  const entries = Object.entries(LOADERS).filter(([path]) => locate(path).lang === lang);
  const releases = await Promise.all(
    entries.map(async ([path, load]) => parseRelease(path, await load())),
  );
  return releases.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
