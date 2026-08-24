import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { SwipeRow } from "../../../shared/ui/swipe-row";
import { nextDuePayment, paidCount, progressRatio } from "../lib/installmentMetrics";
import { PlanStatusBadge, planStatusText } from "./PlanStatusBadge";

interface InstallmentPlanListProps {
  readonly plans: installments.InstallmentPlan[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onEdit: (plan: installments.InstallmentPlan) => void;
  readonly onDelete: (id: string) => void;
}

/**
 * The same one-row-per-plan list, stacked, for when the table's columns no
 * longer fit. On a phone it is exactly Movimientos' own compact row shape —
 * icon, title, ONE subtitle line, trailing amount; the coloured status pill,
 * the progress bar and the remaining figure only earn their room from `sm`
 * up, where there's actually space for them without crowding the row.
 *
 * No chevron: every compact row in this app is already fully tappable, so one
 * would just repeat what the row itself already says.
 *
 * Editar/Eliminar live behind the same swipe-to-reveal gesture Movimientos
 * uses (`SwipeRow`, shared rather than transaction-specific) — a tap still
 * opens the plan.
 */
export function InstallmentPlanList({
  plans,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: InstallmentPlanListProps) {
  const { t, i18n } = useTranslation();
  // Only one row's swipe panel open at a time — opening another closes the
  // previous one for free, since both read off this single id.
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
      {plans.map((plan) => {
        const next = nextDuePayment(plan.payments);
        const money = (value: string) =>
          formatMoney(value, { locale: i18n.language, currency: plan.currency });

        return (
          <li key={plan.id}>
            <SwipeRow
              open={openSwipeId === plan.id}
              onOpenChange={(open) => setOpenSwipeId(open ? plan.id : null)}
              onEdit={() => onEdit(plan)}
              onDelete={() => onDelete(plan.id)}
              onTap={() => onSelect(plan.id)}
            >
              <div
                aria-current={selectedId === plan.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40",
                  selectedId === plan.id && "bg-accent/5",
                  plan.status === "OVERDUE" && "border-l-2 border-l-destructive",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
                  <CategoryIcon category={plan.category} className="h-4 w-4" />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{plan.title}</span>
                    {/* The coloured pill only earns its room from `sm` up — on
                        a phone the same words fold into the subtitle below. */}
                    <span className="hidden sm:inline-flex">
                      <PlanStatusBadge status={plan.status} nextDueDate={plan.nextDueDate} />
                    </span>
                  </span>

                  {/* Phone: one plain line, same shape as Movimientos' own
                      subtitle — progress and status, nothing else. */}
                  <span className="truncate text-xs text-muted-foreground sm:hidden">
                    {t("installments.list.progressAndStatus", {
                      paid: paidCount(plan),
                      total: plan.installmentCount,
                      status: planStatusText(plan.status, plan.nextDueDate, t, i18n.language),
                    })}
                  </span>

                  {/* Tablet and up: the bar earns its room once the pill above
                      already has its own line. */}
                  <span className="hidden items-center gap-3 sm:flex">
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

                  {/* Spec 014, FR-019: only relevant to a credit-card plan. */}
                  {plan.billedCount > 0 && (
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {t("installments.counters.billed", { count: plan.billedCount })}
                      {plan.scheduledCount > 0 &&
                        ` · ${t("installments.counters.scheduled", { count: plan.scheduledCount })}`}
                    </span>
                  )}
                </span>

                {/* Trailing amount column, vertically centered with the icon —
                    same position Movimientos keeps its own amount in. The
                    remaining total stacks under it only from `sm` up. */}
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      next ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {next ? `−${money(next.dueAmount)}` : "—"}
                  </span>
                  <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                    {t("installments.list.remaining", { amount: money(plan.remainingAmount) })}
                  </span>
                </span>
              </div>
            </SwipeRow>
          </li>
        );
      })}
    </ul>
  );
}
