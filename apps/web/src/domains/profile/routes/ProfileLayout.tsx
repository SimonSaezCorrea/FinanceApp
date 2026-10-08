import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useMatch } from "react-router";

import { cn } from "../../../shared/lib/cn";
import { PROFILE_PANES_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { ComingSoonNote } from "../components/ComingSoonNote";
import { ProfileIdentity } from "../components/ProfileIdentity";
import { ProfileSectionNav } from "../components/ProfileSectionNav";
import { ProfileSummary } from "../components/ProfileSummary";
import { useProfileStatuses } from "../hooks/useProfileStatuses";

/**
 * The profile's frame (specs/029). Its shape follows its OWN width, not the viewport's (the
 * collapsible sidebar changes the room it gets — research R2):
 * - two panes (≥ `PROFILE_PANES_MIN_WIDTH`): a page header ("Perfil" + who it belongs to, one
 *   line), then a text-only section index beside the open section, its content capped at a
 *   readable width; `/profile` shows the summary;
 * - one column (narrower, or not measured yet — safe at any width): `/profile` is the start view
 *   (identity, the summary without quick settings, the section list) and each section is its own
 *   screen with a way back to it.
 */
export function ProfileLayout() {
  const { t } = useTranslation();
  const [measure, width] = useElementWidth();
  const panes = width !== null && width >= PROFILE_PANES_MIN_WIDTH;
  const atStart = useMatch({ path: "/profile", end: true }) !== null;
  const statuses = useProfileStatuses();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { pathname } = useLocation();
  const lastPathname = useRef(pathname);

  // Opening a section moves focus to its heading (the section, not the page, is what changed) and,
  // in one column, back to the top: the new screen starts where the user starts reading.
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    containerRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    if (!panes) window.scrollTo?.({ top: 0 });
  }, [pathname, panes]);

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        measure(el);
      }}
    >
      {panes ? (
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8">
          <header className="border-b pb-6">
            <ProfileIdentity variant="header" />
          </header>
          <div className="grid grid-cols-[13rem_minmax(0,1fr)] items-start gap-10">
            <aside className="sticky top-6 flex flex-col gap-6">
              <ProfileSectionNav variant="panel" statuses={statuses} />
              <ComingSoonNote />
            </aside>
            <div className="min-w-0 max-w-[760px]">
              <Outlet />
            </div>
          </div>
        </div>
      ) : atStart ? (
        <div className="flex flex-col gap-6">
          <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none">
            {t("profile.title")}
          </h1>
          <ProfileIdentity variant="full" />
          <ProfileSummary showQuickSettings={false} />
          <ProfileSectionNav variant="list" statuses={statuses} />
          <ComingSoonNote />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Link
            to="/profile"
            aria-label={t("profile.nav.back")}
            className={cn(
              "-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md px-2 text-sm font-medium text-muted-foreground",
              "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t("profile.title")}
          </Link>
          <Outlet />
        </div>
      )}
    </div>
  );
}
