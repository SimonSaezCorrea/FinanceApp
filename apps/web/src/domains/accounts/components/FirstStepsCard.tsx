import { Check, Plus, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { withBrand } from "@finance/ui/src/shared/lib/brand";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { buttonClasses } from "@finance/ui/src/shared/ui/button-classes";

import { FIRST_STEPS, type FirstStep, type FirstStepsDone, nextFirstStep } from "../lib/onboarding";

/**
 * The guided first steps (2026-10-11): create an account → record a movement → build the wallet.
 * Each step ticks off as it happens and the next one carries its own button; the card stays until
 * all three are done (or the person hides it). Only the current step can be started from here —
 * the next ones need the one before.
 */
export function FirstStepsCard({
  done,
  actions,
  onHide,
  className,
}: Readonly<{
  done: FirstStepsDone;
  /** What each step's button does; a step without one shows no button. */
  actions: Partial<Record<FirstStep, () => void>>;
  /** "Ocultar guía"; omitted where the guide can't be hidden. */
  onHide?: () => void;
  className?: string;
}>) {
  const { t } = useTranslation();
  const current = nextFirstStep(done);
  if (current === null) return null;
  const completed = FIRST_STEPS.filter((step) => done[step]).length;
  const action = actions[current];

  return (
    <section
      aria-labelledby="first-steps-title"
      className={cn(
        "flex flex-col gap-5 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="first-steps-title" className="text-lg font-semibold tracking-tight">
            {t(`accounts.onboarding.title.${current}`)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {withBrand(t(`accounts.onboarding.description.${current}`))}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {t("accounts.onboarding.progress", { done: completed, total: FIRST_STEPS.length })}
        </span>
        {onHide ? (
          <button
            type="button"
            onClick={onHide}
            aria-label={t("accounts.onboarding.hide")}
            title={t("accounts.onboarding.hide")}
            className="-m-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {FIRST_STEPS.map((step, index) => {
          const isDone = done[step];
          const isCurrent = step === current;
          return (
            <li
              key={step}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex gap-3 rounded-xl border bg-card p-3",
                isCurrent && "border-primary/50 ring-1 ring-primary/20",
                !isDone && !isCurrent && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  isDone && "bg-success/15 text-success",
                  isCurrent && "bg-primary text-primary-foreground",
                  !isDone && !isCurrent && "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {isDone ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  {t(`accounts.onboarding.steps.${step}.title`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isDone
                    ? t("accounts.onboarding.stepDone")
                    : t(`accounts.onboarding.steps.${step}.body`)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        {action ? (
          <Button onClick={action}>
            <Plus className="size-4" aria-hidden />
            {t(`accounts.onboarding.cta.${current}`)}
          </Button>
        ) : null}
        {current === "movement" || current === "account" ? (
          <Link to="/import" className={buttonClasses({ variant: "outline" })}>
            <Upload className="size-4" aria-hidden />
            {t("accounts.onboarding.import")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
