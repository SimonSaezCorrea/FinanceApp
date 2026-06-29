import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/lib/cn";
import { monthlyAmount, nextDuePayment } from "../lib/installmentMetrics";

interface InstallmentPlanCardProps {
  readonly plan: installments.InstallmentPlan;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function InstallmentPlanCard({
  plan,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: InstallmentPlanCardProps) {
  const { t, i18n } = useTranslation();
  const paidCount = plan.payments.filter((p) => p.paidAt !== null).length;
  const monthly = monthlyAmount(plan);
  const nextDue = nextDuePayment(plan.payments);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <span className="font-medium">{plan.title}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {nextDue ? (
            <Badge variant="accent" className="shrink-0 mr-1">
              {t("installments.planCard.nextDue", {
                date: new Date(nextDue.dueDate).toLocaleDateString(i18n.language),
              })}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label={t("common.edit")}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label={t("common.delete")}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground text-left focus-visible:outline-none"
      >
        <span>
          {t("installments.planCard.progress", {
            paid: paidCount,
            total: plan.installmentCount,
          })}
        </span>
        <span>
          {t("installments.planCard.installmentAmount")}:{" "}
          <span className="tabular-nums text-foreground">
            {formatMoney(monthly, { locale: i18n.language, currency: plan.currency })}
          </span>
        </span>
        <span className="tabular-nums">
          {formatMoney(plan.totalPrincipal, { locale: i18n.language, currency: plan.currency })}
        </span>
      </button>

      <button type="button" onClick={onSelect} className="focus-visible:outline-none">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.min(100, (paidCount / plan.installmentCount) * 100)}%`,
            }}
          />
        </div>
      </button>
    </div>
  );
}
