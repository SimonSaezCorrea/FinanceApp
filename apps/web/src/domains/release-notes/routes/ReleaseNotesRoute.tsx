import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { authApi } from "@finance/client";
import { hasUnseen, latestReleaseId } from "@finance/release-notes/src/lazy";
import { withBrand } from "@finance/ui/src/shared/lib/brand";

import { useAuth } from "../../auth/hooks/useAuth";
import { PageHeader } from "../../../shared/ui/page-header";
import { Skeleton } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { ReleaseItem } from "../components/ReleaseItem";
import { releaseLanguage, useReleaseNotes } from "../hooks/useReleaseNotes";

/**
 * Novedades (spec 038): what changed in each deploy, newest first — the same records the public
 * site shows at /es/novedades/. Opening it marks the newest one as seen ON THE ACCOUNT, so the dot
 * goes away on every device. If that can't be saved (offline, an API that predates it), the page
 * still reads and it is tried again next time.
 */
export function ReleaseNotesRoute() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const lang = releaseLanguage(i18n.language);
  const releases = useReleaseNotes(lang);
  const marking = useRef(false);

  const latest = latestReleaseId();
  const unseen = user ? hasUnseen(latest, user.releaseNotesSeenId) : false;

  useEffect(() => {
    if (!unseen || !latest || marking.current) return;
    marking.current = true;
    void authApi
      .markReleaseNotesSeen(latest)
      .then(() => refreshUser())
      .catch(() => {
        // Not saved: the dot stays and it is asked again the next time Novedades opens.
      });
  }, [unseen, latest, refreshUser]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={t("releaseNotes.title")} description={withBrand(t("releaseNotes.lead"))} />
      <p className="-mt-3 text-xs text-muted-foreground">{t("releaseNotes.since")}</p>
      {releases.isPending ? (
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : releases.isError ? (
        <ErrorState
          inline
          title={t("releaseNotes.loadError")}
          onRetry={() => void releases.refetch()}
        />
      ) : releases.data.length === 0 ? (
        <EmptyState title={t("releaseNotes.empty")} />
      ) : (
        <ol className="flex flex-col gap-4">
          {releases.data.map((release) => (
            <li key={release.id}>
              <ReleaseItem release={release} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
