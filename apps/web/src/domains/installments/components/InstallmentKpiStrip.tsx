import { formatMoney } from "@finance/money";
import type { installments } from "@finance/contracts";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { planKpis } from "../lib/installmentMetrics";

interface InstallmentKpiStripProps {
  readonly plans: installments.InstallmentPlan[];
}

/**
 * The four figures above the list: what this month costs, what is still owed, when
 * the next instalment falls, and how many plans are alive.
 *
 * One group of four per currency, labelled — with no exchange rate in this app,
 * adding CLP to USD would produce a number that means nothing, so they never share a
 * tile (FR-005/FR-005a).
 */
export function InstallmentKpiStrip({ plans }: InstallmentKpiStripProps) {
  const { t, i18n } = useTranslation();
  const groups = planKpis(plans);

  // No plans, no figures: a row of zeros reads as data the user doesn't have (FR-058).
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((kpi) => (
        <section key={kpi.currency} aria-label={kpi.currency} className="flex flex-col gap-2">
          {groups.length > 1 && (
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {kpi.currency}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t("installments.kpi.thisMonth")}>
              {formatMoney(kpi.thisMonth, { locale: i18n.language, currency: kpi.currency })}
            </Tile>
            <Tile label={t("installments.kpi.pending")}>
              {formatMoney(kpi.pendingTotal, { locale: i18n.language, currency: kpi.currency })}
            </Tile>
            <Tile label={t("installments.kpi.nextDue")} emphasis={kpi.nextIsOverdue}>
              {kpi.nextDueDate === null
                ? t("installments.kpi.nothingDue")
                : formatNextDue(kpi.nextDueDate, kpi.nextIsOverdue, i18n.language, t)}
            </Tile>
            <Tile label={t("installments.kpi.activePlans")}>{kpi.activeCount}</Tile>
          </div>
        </section>
      ))}
    </div>
  );
}

function formatNextDue(
  iso: string,
  overdue: boolean,
  locale: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const date = new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  return overdue ? t("installments.kpi.overdueOn", { date }) : date;
}

interface TileProps {
  readonly label: string;
  /** Overdue is the one figure that must be readable as a problem at a glance (FR-006). */
  readonly emphasis?: boolean;
  readonly children: React.ReactNode;
}

function Tile({ label, emphasis = false, children }: TileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums tracking-tight",
          emphasis ? "text-destructive" : "text-foreground",
        )}
      >
        {children}
      </span>
    </div>
  );
}
