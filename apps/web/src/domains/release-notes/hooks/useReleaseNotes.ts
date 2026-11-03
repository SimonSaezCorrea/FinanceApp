import { useQuery } from "@tanstack/react-query";

import { hasUnseen, latestVersion, loadVersions } from "@finance/release-notes/src/lazy";
import type { ReleaseLanguage } from "@finance/release-notes/src/parse";

import { useAuth } from "../../auth/hooks/useAuth";

/** The app's language as a records language (anything not English reads the Spanish ones). */
export function releaseLanguage(language: string | undefined): ReleaseLanguage {
  return language?.startsWith("en") ? "en" : "es";
}

/** Novedades (spec 038) by version in one language, loaded from the bundled records only when
 * asked. They never change while the app runs, so they are read once. */
export function useReleaseNotes(lang: ReleaseLanguage) {
  return useQuery({
    queryKey: ["releaseNotes", lang],
    queryFn: () => loadVersions(lang),
    staleTime: Infinity,
  });
}

/** Whether there is a version newer than the last one this account saw (the "new" dot). Costs
 * nothing: the versions come with the build, and "seen" from `/auth/me`. */
export function useHasUnseenReleaseNotes(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasUnseen(latestVersion(), user.releaseNotesSeenVersion);
}
