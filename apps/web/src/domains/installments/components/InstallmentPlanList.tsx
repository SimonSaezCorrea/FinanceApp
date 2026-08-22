import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { nextDuePayment, paidCount, progressRatio } from "../lib/installmentMetrics";
import { PlanStatusBadge } from "./PlanStatusBadge";

interface InstallmentPlanListProps {
  readonly plans: installments.InstallmentPlan[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

/**
 * The same one-row-per-plan list, stacked, for when the table's columns no longer
 * fit. It keeps icon, title, state, progress, instalment amount and remaining
 * (FR-055a); what it gives up is the date range and the card, which are the two
 * details a reader can go into the plan for.
 *
 * Edit and delete are not here on purpose: at this width they would be two 24px
 * targets next to a row that is itself tappable. They live inside the plan.
 */
export function InstallmentPlanList({ plans, selectedId, onSelect }: InstallmentPlanListProps) {
  const { t, i18n } = useTranslation();

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
      {plans.map((plan) => {
        const next = nextDuePayment(plan.payments);
        const money = (value: string) =>
          formatMoney(value, { locale: i18n.language, currency: plan.currency });

        return (
          <li key={plan.id}>
            <button
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-current={selectedId === plan.id ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40",
                selectedId === plan.id && "bg-accent/5",
                plan.status === "OVERDUE" && "border-l-2 border-l-destructive",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-chip text-muted-foreground">
                <CategoryIcon category={plan.category} className="h-4 w-4" />
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{plan.title}</span>
                  <PlanStatusBadge status={plan.status} nextDueDate={plan.nextDueDate} />
                </span>

                <span className="flex items-center gap-3">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-track">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(progressRatio(plan) * 100)}%` }}
                    />
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {paidCount(plan)}/{plan.installmentCount}
                  </span>
                </span>

                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium tabular-nums text-foreground">
                    {next ? money(next.dueAmount) : "—"}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("installments.list.remaining", { amount: money(plan.remainingAmount) })}
                  </span>
                </span>
              </span>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
