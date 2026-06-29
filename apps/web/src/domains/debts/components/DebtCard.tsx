import { Pencil, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { calcRemaining } from "../lib/debtMetrics";

interface DebtCardProps {
  readonly debt: debts.Debt;
  readonly onSettle?: () => void;
  readonly onRegisterPayment?: () => void;
  readonly onUndoPayment?: () => void;
  readonly onUnsettle?: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function DebtCard({
  debt,
  onSettle,
  onRegisterPayment,
  onUndoPayment,
  onUnsettle,
  onEdit,
  onDelete,
}: DebtCardProps) {
  const { t, i18n } = useTranslation();
  const initial = debt.counterparty.charAt(0).toUpperCase();
  const hasInstallments = debt.totalInstallments > 1;
  const allPaid = debt.paidInstallments >= debt.totalInstallments;
  const remaining = hasInstallments ? calcRemaining(debt) : null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
          aria-hidden
        >
          {initial}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{debt.counterparty}</span>
          <span className="tabular-nums text-sm text-muted-foreground">
            {formatMoney(debt.principal, { locale: i18n.language, currency: debt.currency })}
          </span>
          {debt.dueAt ? (
            <span className="text-xs text-muted-foreground">
              {new Date(debt.dueAt).toLocaleDateString(i18n.language)}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("common.edit")}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("common.delete")}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {hasInstallments ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("debts.card.installments", {
                paid: debt.paidInstallments,
                total: debt.totalInstallments,
              })}
            </span>
            {remaining && !allPaid ? (
              <span>
                {t("debts.card.remaining", {
                  amount: formatMoney(remaining, {
                    locale: i18n.language,
                    currency: debt.currency,
                  }),
                })}
              </span>
            ) : null}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, (debt.paidInstallments / debt.totalInstallments) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {debt.settledAt ? (
        <p className="text-xs text-muted-foreground">
          {t("debts.card.settledOn", {
            date: new Date(debt.settledAt).toLocaleDateString(i18n.language),
          })}
        </p>
      ) : null}

      <div className="flex gap-2">
        {!debt.settledAt && !hasInstallments && onSettle ? (
          <Button size="sm" variant="outline" onClick={onSettle} className="flex-1">
            {t("debts.card.markPaid")}
          </Button>
        ) : null}
        {!debt.settledAt && hasInstallments && !allPaid && onRegisterPayment ? (
          <Button size="sm" variant="outline" onClick={onRegisterPayment} className="flex-1">
            {t("debts.card.registerPayment")}
          </Button>
        ) : null}
        {!debt.settledAt && hasInstallments && debt.paidInstallments > 0 && onUndoPayment ? (
          <button
            type="button"
            onClick={onUndoPayment}
            aria-label={t("debts.card.undoPayment")}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        ) : null}
        {debt.settledAt && onUnsettle ? (
          <Button size="sm" variant="ghost" onClick={onUnsettle} className="flex-1">
            {t("debts.card.unsettle")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
