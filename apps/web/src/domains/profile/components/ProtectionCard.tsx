import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cn } from "../../../shared/lib/cn";
import { buttonClasses } from "../../../shared/ui/button-classes";
import { Skeleton } from "../../../shared/ui/skeleton";
import { ErrorState } from "../../../shared/ui/states";
import { doneStageCount, nextProtectionStep, type ProtectionStage } from "../lib/profileStatus";

/**
 * The account's protection as three stages in a fixed order — password, passkey, two-step — with
 * the next one the user can actually do here (specs/029 FR-008..010a). A stage whose data hasn't
 * loaded shows as loading, never as done or pending (FR-014).
 */
export function ProtectionCard({
  stages,
  error,
  onRetry,
}: Readonly<{ stages: ProtectionStage[]; error?: unknown; onRetry?: () => void }>) {
  const { t } = useTranslation();
  const next = nextProtectionStep(stages);
  const doneCount = doneStageCount(stages);
  const allDone = doneCount === stages.length;
  const titleId = "profile-protection-title";

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-5 rounded-2xl border bg-gradient-to-b from-surface2 to-card p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold sm:text-lg">
          {t("profile.summary.protection.title")}
        </h2>
        <span className="font-mono text-sm text-primary">
          {t("profile.summary.protection.progress", { done: doneCount })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {stages.map((stage) => (
          <span
            key={stage.key}
            className={cn(
              "h-1.5 rounded-full",
              stage.done === true ? "bg-primary" : stage.done === null ? "bg-muted" : "bg-track",
            )}
          />
        ))}
      </div>

      <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {stages.map((stage, index) => (
          <li key={stage.key} className="flex items-start gap-3 sm:flex-col sm:gap-2">
            <StageMark stage={stage} index={index} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t(`profile.summary.protection.stages.${stage.key}.title`)}
                <span className="sr-only">
                  {" · "}
                  {stage.done === true
                    ? t("profile.summary.protection.done")
                    : t("profile.summary.protection.pending")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {stage.done === false && !stage.available
                  ? t("profile.summary.protection.notAvailable")
                  : t(`profile.summary.protection.stages.${stage.key}.hint`)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {error ? (
        <ErrorState inline error={error} onRetry={onRetry} />
      ) : next === undefined ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : next ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-background/60 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <span className="font-semibold">{t("profile.summary.protection.nextStep")}: </span>
            {t(`profile.summary.protection.nextStepBody.${next.key}`)}
          </p>
          <Link to={next.target} className={buttonClasses({ className: "h-11 sm:h-10" })}>
            {t(`profile.summary.protection.actions.${next.key}`)}
          </Link>
        </div>
      ) : (
        <p className="rounded-xl border bg-background/60 p-4 text-sm text-muted-foreground">
          {allDone
            ? t("profile.summary.protection.complete")
            : t("profile.summary.protection.noneHere")}
        </p>
      )}
    </section>
  );
}

function StageMark({ stage, index }: Readonly<{ stage: ProtectionStage; index: number }>) {
  if (stage.done === null) return <Skeleton className="h-7 w-7 shrink-0 rounded-full" />;
  if (stage.done) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed font-mono text-xs font-semibold",
        stage.available
          ? "border-accent text-accent"
          : "border-muted-foreground text-muted-foreground",
      )}
      aria-hidden
    >
      {index + 1}
    </span>
  );
}
