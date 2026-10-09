import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { PROFILE_GROUPS, PROFILE_SECTIONS, sectionHref } from "../lib/profileSections";
import type { SectionStatuses } from "../lib/profileStatus";

/**
 * The profile's sections, grouped, each with its status line and a pending count where the user
 * has something to do (specs/029 FR-001/002). `panel` is the two-pane form's secondary index:
 * text only, the open section marked by a thin bar, so it never competes with the app's own
 * sidebar beside it. `list` is the phone's start view, which leaves out the summary because it
 * already shows it.
 */
export function ProfileSectionNav({
  variant,
  statuses,
}: Readonly<{ variant: "panel" | "list"; statuses: SectionStatuses | null }>) {
  const { t } = useTranslation();
  const sections = PROFILE_SECTIONS.filter((s) => variant === "panel" || s.key !== "summary");

  return (
    <nav aria-label={t("profile.nav.label")} className="flex flex-col gap-4">
      {PROFILE_GROUPS.map((group) => {
        const items = sections.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <h2
              className={cn(
                "text-xs font-semibold text-dim",
                variant === "panel" ? "pl-3.5" : "px-3",
              )}
            >
              {t(`profile.groups.${group}`)}
            </h2>
            <ul
              className={cn(
                "flex flex-col",
                variant === "list" && "divide-y overflow-hidden rounded-2xl border bg-card",
              )}
            >
              {items.map(({ key, icon: Icon, path }) => {
                const status = statuses?.[key];
                return (
                  <li key={key}>
                    <NavLink
                      to={sectionHref({ path })}
                      end={path === ""}
                      className={({ isActive }) =>
                        cn(
                          "group grid items-center gap-3 py-2 transition-colors",
                          variant === "panel"
                            ? cn(
                                "min-h-12 grid-cols-[minmax(0,1fr)_auto] border-l-2 pl-3 pr-1",
                                isActive
                                  ? "border-primary"
                                  : "border-transparent hover:border-border2",
                              )
                            : "min-h-16 grid-cols-[1.25rem_minmax(0,1fr)_auto] px-3 active:bg-muted/60",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {variant === "list" ? (
                            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                          ) : null}
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate text-sm",
                                variant === "panel" && !isActive
                                  ? "font-medium text-muted-foreground group-hover:text-foreground"
                                  : "font-semibold text-foreground",
                              )}
                            >
                              {t(`profile.sections.${key}.title`)}
                            </span>
                            {status ? (
                              <span className="block truncate text-xs text-dim">{status.line}</span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-2">
                            {status && status.pending > 0 ? (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 text-xs font-semibold text-accent">
                                <span aria-hidden>{status.pending}</span>
                                <span className="sr-only">
                                  {t("profile.nav.pending", { count: status.pending })}
                                </span>
                              </span>
                            ) : null}
                            {variant === "list" ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                            ) : null}
                          </span>
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
