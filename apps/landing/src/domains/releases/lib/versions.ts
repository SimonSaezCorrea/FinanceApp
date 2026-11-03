import { versionSlug, type ReleaseVersion } from "@finance/release-notes";

import { type Language, pagePath } from "../../../lib/language";

/** A version's address (spec 038): the newest is Novedades itself, every other one has its own
 * (`/es/novedades/v1-1/`). */
export function versionPath(
  lang: Language,
  version: string,
  versions: readonly Pick<ReleaseVersion, "version">[],
): string {
  const base = pagePath(lang, "releaseNotes");
  return versions[0]?.version === version ? base : `${base}${versionSlug(version)}/`;
}
