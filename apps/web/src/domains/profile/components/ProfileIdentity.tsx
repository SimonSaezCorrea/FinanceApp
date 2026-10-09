import { useTranslation } from "react-i18next";

import { getInitials } from "../../../shared/lib/initials";
import { useAuth } from "../../auth/hooks/useAuth";
import { useProfileStats } from "../hooks/useProfile";

/**
 * Who the profile belongs to (specs/029 FR-019): initials, name (or the email when there's none),
 * the email, and accounts · movements this month · year joined. `header` is the two-pane page
 * header (the page title "Perfil" with the identity on one line under it); `full` heads the
 * phone's start view.
 */
export function ProfileIdentity({ variant }: Readonly<{ variant: "header" | "full" }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const stats = useProfileStats();
  if (!user) return null;

  const statsLine = stats.isLoading
    ? "–"
    : t("profile.identity.stats", {
        accounts: stats.accountsCount,
        movements: stats.monthlyMovementsCount,
        year: user.memberSinceYear,
      });
  const initials = getInitials(user.name, user.email);

  if (variant === "header") {
    return (
      <div className="flex min-w-0 items-center gap-4">
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-primary/20 text-base font-semibold text-foreground"
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight">{t("profile.title")}</p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{user.name || user.email}</span>
            {user.name ? (
              <>
                <span aria-hidden>·</span>
                <span>{user.email}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{statsLine}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-4">
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-semibold text-foreground"
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{user.name || user.email}</p>
        {user.name ? <p className="truncate text-sm text-muted-foreground">{user.email}</p> : null}
        <p className="truncate text-xs text-muted-foreground">{statsLine}</p>
      </div>
    </div>
  );
}
