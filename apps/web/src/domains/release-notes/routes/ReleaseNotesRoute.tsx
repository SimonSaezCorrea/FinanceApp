import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { authApi } from "@finance/client";
import { hasUnseen, isNewerThanSeen, latestVersion } from "@finance/release-notes/src/lazy";
import type { LoadedVersion } from "@finance/release-notes/src/lazy";
import { withBrand } from "@finance/ui/src/shared/lib/brand";

import { useAuth } from "../../auth/hooks/useAuth";
import { cn } from "@finance/ui/src/shared/lib/cn";
import {
  RELEASE_NOTES_PANES_MIN_WIDTH,
  useElementWidth,
} from "../../../shared/lib/useElementWidth";
import { PageHeader } from "../../../shared/ui/page-header";
import { Skeleton } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { ReleaseItem } from "../components/ReleaseItem";
import { releaseLanguage, useReleaseNotes } from "../hooks/useReleaseNotes";

function formatDay(day: string, language: string, month: "long" | "short"): string {
  return new Intl.DateTimeFormat(language.startsWith("en") ? "en-US" : "es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month,
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}

function changeCount(version: LoadedVersion): number {
  return version.releases.reduce(
    (sum, r) => sum + r.groups.reduce((n, g) => n + g.items.length, 0),
    0,
  );
}

/** One version in the list: number, day, "new" and how many changes. What it brought is the
 * summary at the top of the version itself. */
function VersionButton({
  version,
  selected,
  unseen,
  wide,
  onSelect,
}: Readonly<{
  version: LoadedVersion;
  selected: boolean;
  unseen: boolean;
  wide: boolean;
  onSelect: () => void;
}>) {
  const { t, i18n } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={t("releaseNotes.version", { version: version.version })}
      className={cn(
        "flex min-h-11 shrink-0 flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
        selected ? "border-primary/50 bg-surface2" : "bg-card hover:bg-surface2",
        wide && "w-full",
      )}
    >
      <span className="flex w-full items-baseline gap-2">
        <span className="font-semibold">v{version.version}</span>
        <span className="text-xs text-muted-foreground">
          {formatDay(version.date, i18n.language, "short")}
        </span>
        {unseen ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {t("releaseNotes.unseen")}
          </span>
        ) : null}
      </span>
      {wide ? (
        <span className="text-xs text-muted-foreground">
          {t("releaseNotes.changes", { count: changeCount(version) })}
        </span>
      ) : null}
    </button>
  );
}

/** The chosen version: its header, "En esta versión" (each record and its summary, a link to its
 * section) and then each record, so it reads top-down. */
function VersionDetail({
  version,
  current,
}: Readonly<{ version: LoadedVersion; current: boolean }>) {
  const { t, i18n } = useTranslation();
  return (
    <article
      aria-labelledby="release-version-title"
      className="flex min-w-0 flex-1 flex-col gap-6 rounded-2xl border bg-card p-5 sm:p-7"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="release-version-title" className="text-2xl font-semibold tracking-tight">
            v{version.version}
          </h2>
          {current ? (
            <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {t("releaseNotes.current")}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          <time dateTime={version.date}>
            {t("releaseNotes.published", { date: formatDay(version.date, i18n.language, "long") })}
          </time>
          {" · "}
          {t("releaseNotes.changes", { count: changeCount(version) })}
        </p>
      </header>
      <nav
        aria-label={t("releaseNotes.inThisVersion")}
        className="rounded-xl bg-surface2 p-4 sm:p-5"
      >
        <p className="text-sm font-semibold">{t("releaseNotes.inThisVersion")}</p>
        <ol className="mt-3 flex flex-col gap-3">
          {version.releases.map((release) => (
            <li key={release.id} className="flex flex-col gap-0.5">
              <a href={`#${release.id}`} className="text-sm font-medium hover:underline">
                {withBrand(release.title)}
              </a>
              {release.summary ? (
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {withBrand(release.summary)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>
      {version.releases.map((release) => (
        <ReleaseItem key={release.id} release={release} />
      ))}
    </article>
  );
}

/**
 * Novedades (spec 038): one version at a time — a deploy that published records, `v1.2` — with
 * the list of versions beside it (above it when narrow); `?version=1.1` opens another. Opening it
 * marks the newest version as seen ON THE ACCOUNT, so the dot goes away on every device; the
 * versions newer than what was seen on arrival keep their "new" mark while the page is open. If
 * saving fails (offline, an API that predates it), the page still reads and it is tried again
 * next time.
 */
export function ReleaseNotesRoute() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const lang = releaseLanguage(i18n.language);
  const versions = useReleaseNotes(lang);
  const [params, setParams] = useSearchParams();
  const [ref, width] = useElementWidth();
  const wide = width !== null && width >= RELEASE_NOTES_PANES_MIN_WIDTH;
  const marking = useRef(false);

  const latest = latestVersion();
  const [seenOnArrival] = useState(() => user?.releaseNotesSeenVersion ?? null);
  const unseen = user ? hasUnseen(latest, user.releaseNotesSeenVersion) : false;

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

  const list = versions.data ?? [];
  const selected = list.find((v) => v.version === params.get("version")) ?? list[0];
  const select = (version: string) =>
    setParams(version === list[0]?.version ? {} : { version }, { replace: true });

  return (
    <div ref={ref} className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={t("releaseNotes.title")} description={withBrand(t("releaseNotes.lead"))} />
      {versions.isPending ? (
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : versions.isError ? (
        <ErrorState
          inline
          title={t("releaseNotes.loadError")}
          onRetry={() => void versions.refetch()}
        />
      ) : !selected ? (
        <EmptyState title={t("releaseNotes.empty")} />
      ) : (
        <div className={cn("flex gap-6", wide ? "items-start" : "flex-col")}>
          <nav
            aria-label={t("releaseNotes.versions")}
            className={cn(wide ? "w-64 shrink-0" : "-mx-4 overflow-x-auto px-4 pb-1")}
          >
            <ul className={cn("flex gap-2", wide && "flex-col")}>
              {list.map((v) => (
                <li key={v.version} className={cn(!wide && "shrink-0")}>
                  <VersionButton
                    version={v}
                    selected={v.version === selected.version}
                    unseen={isNewerThanSeen(v.version, seenOnArrival)}
                    wide={wide}
                    onSelect={() => select(v.version)}
                  />
                </li>
              ))}
            </ul>
            {wide ? (
              <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
                {withBrand(t("releaseNotes.since"))}
              </p>
            ) : null}
          </nav>

          <VersionDetail version={selected} current={selected.version === latest} />
          {wide ? null : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {withBrand(t("releaseNotes.since"))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
