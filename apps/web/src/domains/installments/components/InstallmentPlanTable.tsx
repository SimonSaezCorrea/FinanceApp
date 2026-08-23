import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { nextDuePayment, paidCount, progressRatio } from "../lib/installmentMetrics";
import { PlanStatusBadge } from "./PlanStatusBadge";

interface InstallmentPlanTableProps {
  readonly plans: installments.InstallmentPlan[];
  readonly cardLabels: ReadonlyMap<string, string>;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onEdit: (plan: installments.InstallmentPlan) => void;
  readonly onDelete: (id: string) => void;
}

/**
 * One row per PLAN — not per instalment, which is what the old flattened table did
 * and why the same purchase appeared twelve times.
 *
 * Rendered only where the columns fit; below that the route swaps in
 * `InstallmentPlanList`. That decision is made on the CONTAINER's width, not the
 * viewport's, because the collapsible sidebar changes the room available without
 * changing the window.
 */
export function InstallmentPlanTable({
  plans,
  cardLabels,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: InstallmentPlanTableProps) {
  const { t, i18n } = useTranslation();

  return (
    <Table>
      <THead>
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
        {plans.map((plan) => {
          const next = nextDuePayment(plan.payments);
          return (
            <TR
              key={plan.id}
              onClick={() => onSelect(plan.id)}
              className={cn(
                "cursor-pointer",
                selectedId === plan.id && "bg-accent/5",
                plan.status === "OVERDUE" && "border-l-2 border-l-destructive",
              )}
            >
              <TD>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chip text-muted-foreground">
                    <CategoryIcon category={plan.category} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{plan.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatRange(plan, i18n.language)}
                    </p>
                  </div>
                </div>
              </TD>

              <TD>
                <div className="flex items-center gap-3">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-track">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(progressRatio(plan) * 100)}%` }}
                    />
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {paidCount(plan)}/{plan.installmentCount}
                  </span>
                </div>
                {/* Spec 014, FR-019: a credit-card plan gets a stage the plain X/N
                    count can't show — how many are already billed and awaiting their
                    statement's payment. Only rendered when relevant. */}
                {plan.billedCount > 0 && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("installments.counters.billed", { count: plan.billedCount })}
                    {plan.scheduledCount > 0 &&
                      ` · ${t("installments.counters.scheduled", { count: plan.scheduledCount })}`}
                  </span>
                )}
              </TD>

              <TD>
                <PlanStatusBadge status={plan.status} nextDueDate={plan.nextDueDate} />
              </TD>

              <TD align="right">
                <span className="font-medium tabular-nums text-foreground">
                  {next
                    ? formatMoney(next.dueAmount, {
                        locale: i18n.language,
                        currency: plan.currency,
                      })
                    : "—"}
                </span>
                <span className="block text-xs tabular-nums text-muted-foreground">
                  {t("installments.table.ofTotal", {
                    total: formatMoney(plan.totalPrincipal, {
                      locale: i18n.language,
                      currency: plan.currency,
                    }),
                  })}
                </span>
              </TD>

              <TD align="right" className="tabular-nums">
                {formatMoney(plan.remainingAmount, {
                  locale: i18n.language,
                  currency: plan.currency,
                })}
              </TD>

              <TD className="text-muted-foreground">
                {plan.cardId
                  ? (cardLabels.get(plan.cardId) ?? t("installments.table.unknownCard"))
                  : "—"}
              </TD>

              <TD align="right">
                <div className="flex justify-end gap-1">
                  <RowAction
                    label={t("common.edit")}
                    onClick={() => onEdit(plan)}
                    icon={<Pencil className="h-4 w-4" />}
                  />
                  <RowAction
                    label={t("common.delete")}
                    onClick={() => onDelete(plan.id)}
                    icon={<Trash2 className="h-4 w-4" />}
                    danger
                  />
                </div>
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

interface RowActionProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly danger?: boolean;
}

function RowAction({ label, onClick, icon, danger = false }: RowActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // The whole row opens the plan; an action inside it must not do both.
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted",
        danger && "hover:text-destructive",
      )}
    >
      {icon}
    </button>
  );
}

/** "nov 2025 → oct 2027": first instalment to last, which is the plan's real span. */
function formatRange(plan: installments.InstallmentPlan, locale: string): string {
  const dates = plan.payments.map((p) => p.dueDate).sort();
  const first = dates.at(0);
  const last = dates.at(-1);
  if (first === undefined || last === undefined) return "";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "short", year: "numeric" });
  return `${fmt(first)} → ${fmt(last)}`;
}
