import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
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

  const freqLabel = t(`common.frequency.${plan.frequency}`).toLowerCase();
  const subtitle = `${plan.installmentCount} ${t("installments.planCard.installments")} · ${freqLabel}`;

  const nextDueLabel = nextDue
    ? new Date(nextDue.dueDate).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-lg border bg-card p-4 transition-colors",
        selected
          ? "border-foreground/60 ring-1 ring-foreground/20"
          : "hover:border-muted-foreground/40",
      )}
    >
      {/* Invisible overlay — makes the full card keyboard-accessible for selection */}
      <button
        type="button"
        onClick={onSelect}
        aria-label={plan.title}
        aria-pressed={selected}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Title row */}
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold">{plan.title}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {nextDueLabel ? (
            <Badge variant="accent" className="shrink-0">
              {t("installments.planCard.nextDue", { date: nextDueLabel })}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={t("common.edit")}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={t("common.delete")}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Large amount */}
      <span className="relative z-10 text-2xl font-bold tabular-nums tracking-tight">
        {formatMoney(plan.totalPrincipal, { locale: i18n.language, currency: plan.currency })}
      </span>

      {/* Footer: progress + monthly */}
      <div className="relative z-10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("installments.planCard.progress", {
              paid: paidCount,
              total: plan.installmentCount,
            })}
          </span>
          <span className="tabular-nums">
            {formatMoney(monthly, { locale: i18n.language, currency: plan.currency })}
            {t("installments.planCard.perMonth")}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.min(100, (paidCount / plan.installmentCount) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
