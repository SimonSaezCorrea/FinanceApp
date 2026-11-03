/// <reference path="./virtual.d.ts" />
import VERSIONS from "virtual:fik-release-versions";

import { compareVersions } from "../scripts/version-rules.mjs";
import { locate, parseRelease, type Release, type ReleaseLanguage } from "./parse";

/**
 * The app's view of the records (spec 038): the versions come with the build (a few hundred bytes,
 * so the "new" dot costs nothing), and the text is loaded only when Novedades opens — one small
 * chunk per file.
 */
const LOADERS = import.meta.glob<string>("../releases/*/*.md", {
  query: "?raw",
  import: "default",
});

/** One version with its records in one language, newest first. */
export interface LoadedVersion {
  version: string;
  date: string;
  pending: boolean;
  releases: Release[];
}

/** The newest version, or null when there is none. */
export function latestVersion(): string | null {
  return VERSIONS[0]?.version ?? null;
}

/** Whether `version` is newer than the last one the person saw (anything that isn't a version,
 * like a record id saved before versions existed, counts as nothing seen). */
export function isNewerThanSeen(version: string | null, seen: string | null | undefined): boolean {
  return version !== null && compareVersions(version, seen) > 0;
}

/** Whether a version newer than the last one the person saw exists (the "new" dot). */
export function hasUnseen(latest: string | null, seen: string | null | undefined): boolean {
  return isNewerThanSeen(latest, seen);
}

/** Every version with its records in one language, newest version first. */
export async function loadVersions(
  lang: ReleaseLanguage,
  versions: typeof VERSIONS = VERSIONS,
): Promise<LoadedVersion[]> {
  const byId = new Map<string, Release>();
  await Promise.all(
    Object.entries(LOADERS)
      .filter(([path]) => locate(path).lang === lang)
      .map(async ([path, load]) => {
        const release = parseRelease(path, await load());
        byId.set(release.id, release);
      }),
  );
  return versions
    .map((v) => ({
      version: v.version,
      date: v.date,
      pending: v.pending,
      releases: v.records.flatMap((id) => byId.get(id) ?? []),
    }))
    .filter((v) => v.releases.length > 0);
}
