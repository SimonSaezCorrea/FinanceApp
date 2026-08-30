import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TABLE_ROW_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { Card } from "../../../shared/ui/card";
import { Segmented } from "../../../shared/ui/segmented";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";

/** One placeholder plan row, matching `InstallmentPlanList`'s row shape (the
 * narrow/stacked layout). */
function PlanRowSkeleton() {
  return (
    <li className="flex w-full items-center gap-3 p-4">
      <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-[15px] w-32" />
          <Skeleton className="h-[18px] w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-1.5 w-24 rounded-full" />
          <Skeleton className="h-[11px] w-8" />
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-[15px] w-20" />
          <Skeleton className="h-[11px] w-28" />
        </div>
      </div>
    </li>
  );
}

/** One placeholder row for the wide table layout, matching
 * `InstallmentPlanTable`'s column shape. */
function PlanTableRowSkeleton() {
  return (
    <TR>
      <TD className="w-full max-w-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-[13px] w-32" />
            <Skeleton className="h-[11px] w-24" />
          </div>
        </div>
      </TD>
      <TD>
        <div className="flex items-center gap-3">
          <Skeleton className="h-1.5 w-24 rounded-full" />
          <Skeleton className="h-[11px] w-8" />
        </div>
      </TD>
      <TD>
        <Skeleton className="h-[20px] w-20 rounded-full" />
      </TD>
      <TD align="right">
        <Skeleton className="ml-auto h-[13px] w-20" />
      </TD>
      <TD align="right">
        <Skeleton className="ml-auto h-[13px] w-20" />
      </TD>
      <TD>
        <Skeleton className="h-[13px] w-24" />
      </TD>
      <TD align="right">
        <Skeleton className="ml-auto h-8 w-16 rounded-md" />
      </TD>
    </TR>
  );
}

/**
 * Loading shape of the Cuotas view. Only the FIGURES are unknown yet — the KPI
 * labels, the filter switch, the "Próx. 3 meses" toggle and the table's own
 * column headers are ours, fixed, and never depend on the response, so they
 * render for real (same convention as `MovementsTableSkeleton`/
 * `BillingTableSkeleton`); only the numbers/rows shimmer.
 */
export function InstallmentsSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();
  const [containerRef, width] = useElementWidth();
  const wide = width !== null && width >= TABLE_ROW_MIN_WIDTH;

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">{t("installments.kpi.thisMonth")}</span>
          <Skeleton className="h-[22px] w-24" />
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">{t("installments.kpi.pending")}</span>
          <Skeleton className="h-[22px] w-24" />
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">{t("installments.kpi.nextDue")}</span>
          <Skeleton className="h-[22px] w-24" />
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">{t("installments.kpi.activePlans")}</span>
          <Skeleton className="h-[22px] w-16" />
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value="all"
            onChange={() => {}}
            aria-label={t("installments.filters.all")}
            options={[
              { value: "all", label: t("installments.filters.all"), disabled: true },
              { value: "unpaid", label: t("installments.filters.upcoming"), disabled: true },
              { value: "paid", label: t("installments.filters.paid"), disabled: true },
            ]}
          />
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-sm text-muted-foreground disabled:cursor-not-allowed"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            {t("installments.filters.next3months")}
          </button>
        </div>
        <Skeleton className="h-[13px] w-20" />
      </div>

      <div ref={containerRef}>
        <div className={wide ? "block" : "hidden"}>
          <Card className="overflow-hidden p-0">
            <Table>
              <THead className="bg-muted/50">
                <TR>
                  <TH>{t("installments.table.plan")}</TH>
                  <TH>{t("installments.table.progress")}</TH>
                  <TH>{t("installments.table.nextDue")}</TH>
                  <TH align="right">{t("installments.table.instalment")}</TH>
                  <TH align="right">{t("installments.table.remaining")}</TH>
                  <TH>{t("installments.table.card")}</TH>
                  <TH align="right">
                    <span className="sr-only">{t("common.actions")}</span>
                  </TH>
                </TR>
              </THead>
              <tbody>
                {Array.from({ length: 4 }, (_, i) => (
                  <PlanTableRowSkeleton key={i} />
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <ul
          className={
            wide ? "hidden" : "flex flex-col divide-y divide-border rounded-lg border bg-card"
          }
        >
          {Array.from({ length: 4 }, (_, i) => (
            <PlanRowSkeleton key={i} />
          ))}
        </ul>
      </div>
    </SkeletonScreen>
  );
}
