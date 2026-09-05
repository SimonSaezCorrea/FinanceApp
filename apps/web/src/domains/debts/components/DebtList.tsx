import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { ErrorState } from "../../../shared/ui/states";
import { dueInfo, formatDebtDate, initials, isOverdue, leftAmount } from "../lib/debtMetrics";
import { DebtEmptyRow } from "./DebtEmptyRow";

interface DebtListProps {
  readonly debts: debts.Debt[];
  readonly onSelect: (id: string) => void;
  readonly emptyTitle: string;
  readonly emptyMessage?: string;
  readonly error?: unknown;
  readonly onRetry?: () => void;
}

/**
 * The narrow-container form of the list — one row per debt, no inline actions:
 * per the handoff, "toda la fila abre el detalle" and Editar/Registrar
 * abono/Eliminar are reached from the detail panel instead (unlike Cuotas'
 * own compact list, which keeps a swipe-to-reveal shortcut).
 */
export function DebtList({
  debts: list,
  onSelect,
  emptyTitle,
  emptyMessage,
  error,
  onRetry,
}: DebtListProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();

  if (list.length === 0) {
    return (
      <div className="rounded-[9.6px] border bg-card">
        {error ? (
          <ErrorState inline error={error} onRetry={onRetry} />
        ) : (
          <DebtEmptyRow title={emptyTitle} message={emptyMessage} />
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-[9.6px] border bg-card">
      {list.map((debt) => {
        const isOwedToYou = debt.direction === "OWED_TO_YOU";
        const isSettled = debt.settledAt !== null;
        const overdue = isOverdue(debt, now);
        const hasInstallments = debt.totalInstallments > 1;
        const left = leftAmount(debt);
        const due = dueInfo(debt.dueAt, now);

        const meta = hasInstallments
          ? t("debts.list.metaInstallments", {
              concept: debt.notes ?? "",
              paid: debt.paidInstallments,
              total: debt.totalInstallments,
            })
          : t("debts.list.metaDirection", {
              concept: debt.notes ?? "",
              direction: t(`debts.direction.${debt.direction}`),
            });

        const dueNote = isSettled
          ? t("debts.card.settledOn", { date: formatDebtDate(debt.settledAt!, i18n.language) })
          : debt.dueAt
            ? overdue
              ? t("debts.due.agoDays", { count: due.days ?? 0 })
              : due.days === 0
                ? t("debts.due.today")
                : t("debts.due.inDays", { count: due.days ?? 0 })
            : t("debts.due.noDate");

        return (
          <li key={debt.id}>
            <button
              type="button"
              onClick={() => onSelect(debt.id)}
              className={cn(
                "flex w-full items-center gap-3 border-l-2 p-[12px_14px] text-left transition-colors hover:bg-muted/40",
                isOwedToYou ? "border-l-success" : "border-l-destructive",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isOwedToYou ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive",
                )}
              >
                {initials(debt.counterparty)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold text-foreground">
                  {debt.counterparty}
                </span>
                <span className="truncate text-xs text-muted-foreground">{meta}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span
                  className={cn(
                    "text-[15px] font-medium tabular-nums",
                    isOwedToYou ? "text-success" : "text-destructive",
                  )}
                >
                  {isOwedToYou ? "+" : "−"}
                  {formatMoney(left, { locale: i18n.language, currency: debt.currency })}
                </span>
                <span className="text-[11px] text-muted-foreground">{dueNote}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
