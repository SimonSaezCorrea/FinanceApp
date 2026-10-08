import { Check, Laptop, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { isPasskeySupported } from "../../../shared/lib/webauthn";
import { Badge } from "../../../shared/ui/badge";
import { buttonClasses } from "../../../shared/ui/button-classes";
import { Skeleton } from "../../../shared/ui/skeleton";
import { ErrorState } from "../../../shared/ui/states";
import { Switch } from "../../../shared/ui/switch";
import { ThemeSegmented } from "../../../shared/ui/theme-segmented";
import { useAuth } from "../../auth/hooks/useAuth";
import { usePasskeysQuery, useProfileMutations, useSessionsQuery } from "../hooks/useProfile";
import { contactCompleteness, protectionStages, sessionsPreview } from "../lib/profileStatus";
import { ProtectionCard } from "./ProtectionCard";

/**
 * The profile's summary (specs/029 US1): protection by stages, contact details out of three,
 * open sessions and — where there's room for them — quick theme and hide-balances settings. Every
 * action is a link to the place that resolves it. The phone's start view renders it without the
 * quick settings (`showQuickSettings={false}`), since Preferences is one tap away there.
 */
export function ProfileSummary({
  showQuickSettings = true,
}: Readonly<{ showQuickSettings?: boolean }>) {
  const { user } = useAuth();
  const passkeys = usePasskeysQuery();
  if (!user) return null;

  const stages = protectionStages({
    mfaEnabled: user.mfaEnabled,
    passkeyCount: passkeys.isError ? null : (passkeys.data?.length ?? null),
    passkeysSupported: isPasskeySupported(),
  });

  return (
    <div className="flex flex-col gap-4">
      <ProtectionCard
        stages={stages}
        error={passkeys.isError ? passkeys.error : undefined}
        onRetry={() => void passkeys.refetch()}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailsCard user={user} />
        <SessionsCard />
      </div>
      {showQuickSettings ? <QuickSettingsCard hideBalances={user.hideBalances} /> : null}
    </div>
  );
}

function SummaryCard({
  id,
  title,
  aside,
  children,
}: Readonly<{ id: string; title: string; aside?: ReactNode; children: ReactNode }>) {
  const titleId = `profile-summary-${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function DetailsCard({
  user,
}: Readonly<{
  user: { email: string | null; identifierValue?: string | null; phone?: string | null };
}>) {
  const { t } = useTranslation();
  const completeness = contactCompleteness(user);
  const missing = completeness.items.filter((i) => !i.done);

  return (
    <SummaryCard
      id="data"
      title={t("profile.summary.data.title")}
      aside={
        <span
          className={
            missing.length ? "font-mono text-sm text-accent" : "font-mono text-sm text-primary"
          }
        >
          {t("profile.summary.data.progress", { done: completeness.done })}
        </span>
      }
    >
      <ul className="flex flex-col gap-2 text-sm">
        {completeness.items.map((item) => (
          <li key={item.key} className="flex items-center gap-2.5">
            {item.done ? (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <span
                className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-accent"
                aria-hidden
              />
            )}
            {t(`profile.summary.data.items.${item.key}`)}
          </li>
        ))}
      </ul>
      {missing.length ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {missing.map((item) => (
            <Link
              key={item.key}
              to={`/profile/personal?edit=${item.editField}`}
              className={buttonClasses({
                variant: "outline",
                size: "sm",
                className: "h-10 sm:h-9",
              })}
            >
              {t(`profile.summary.data.add.${item.key}`)}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-auto text-sm text-muted-foreground">
          {t("profile.summary.data.complete")}
        </p>
      )}
    </SummaryCard>
  );
}

function SessionsCard() {
  const { t, i18n } = useTranslation();
  const sessions = useSessionsQuery();
  const preview = sessionsPreview(sessions.data ?? []);

  return (
    <SummaryCard
      id="sessions"
      title={t("profile.summary.sessions.title")}
      aside={
        sessions.data ? (
          <span className="font-mono text-sm text-muted-foreground">
            {t("profile.summary.sessions.open", { count: preview.openCount })}
          </span>
        ) : null
      }
    >
      {sessions.isError ? (
        <ErrorState inline error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : sessions.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5 text-sm">
          {preview.shown.map((s) => {
            const Icon = /iphone|android|ipad|mobile/i.test(s.deviceLabel ?? "")
              ? Smartphone
              : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {s.deviceLabel ?? t("profile.security.sessions.unknownDevice")}
                </span>
                {s.isCurrent ? (
                  <Badge variant="success">{t("profile.summary.sessions.current")}</Badge>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(s.lastUsedAt).toLocaleDateString(i18n.language)}
                  </span>
                )}
              </li>
            );
          })}
          {preview.hiddenCount > 0 ? (
            <li className="text-xs text-muted-foreground">
              {t("profile.summary.sessions.more", { count: preview.hiddenCount })}
            </li>
          ) : null}
        </ul>
      )}
      <Link
        to="/profile/security#sessions"
        className="mt-auto inline-flex min-h-10 items-center self-start text-sm font-medium text-primary hover:text-primary/80"
      >
        {t("profile.summary.sessions.review")}
      </Link>
    </SummaryCard>
  );
}

function QuickSettingsCard({ hideBalances }: Readonly<{ hideBalances: boolean }>) {
  const { t } = useTranslation();
  const { updatePreferences } = useProfileMutations();
  return (
    <SummaryCard
      id="quick"
      title={t("profile.summary.quick.title")}
      aside={
        <Link
          to="/profile/preferences"
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          {t("profile.summary.quick.allPreferences")}
        </Link>
      }
    >
      <ThemeSegmented />
      <div className="flex items-center justify-between gap-4 border-t pt-3">
        <div>
          <p className="text-sm font-medium">{t("profile.financial.hideBalances")}</p>
          <p className="text-xs text-muted-foreground">{t("profile.financial.hideBalancesHint")}</p>
        </div>
        <Switch
          checked={hideBalances}
          onCheckedChange={(checked) => updatePreferences.mutate({ hideBalances: checked })}
          aria-label={t("profile.financial.hideBalances")}
        />
      </div>
    </SummaryCard>
  );
}
