import { Banknote, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "@finance/ui/src/shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { ErrorState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import {
  calcRemaining,
  dueInfo,
  formatDebtDate,
  initials,
  isOverdue,
  leftAmount,
  paidPercent,
} from "../lib/debtMetrics";
import { hasPartialInstallment } from "../lib/debtSchedule";
import { DebtEmptyRow } from "./DebtEmptyRow";

interface DebtTableProps {
  readonly debts: debts.Debt[];
  readonly onSelect: (id: string) => void;
  readonly onEdit: (debt: debts.Debt) => void;
  readonly onDelete: (id: string) => void;
  readonly onPay: (debt: debts.Debt) => void;
  readonly emptyTitle: string;
  readonly emptyMessage?: string;
  readonly error?: unknown;
  readonly onRetry?: () => void;
}

const COLUMN_COUNT = 6;

/**
 * Desktop table — one row per debt. Rendered only where the columns fit; below
 * that the route swaps in `DebtList`. See `DebtsRoute` for why that decision is
 * made on the table's own measured width (`useElementWidth` +
 * `TABLE_ROW_MIN_WIDTH`) rather than a viewport breakpoint.
 */
export function DebtTable({
  debts: list,
  onSelect,
  onEdit,
  onDelete,
  onPay,
  emptyTitle,
  emptyMessage,
  error,
  onRetry,
}: DebtTableProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <THead className="bg-muted/50">
          <TR>
            <TH>{t("debts.table.person")}</TH>
            <TH>{t("debts.table.progress")}</TH>
            <TH>{t("debts.table.type")}</TH>
            <TH numeric>{t("debts.table.pending")}</TH>
            <TH>{t("debts.table.due")}</TH>
            <TH numeric>
              <span className="sr-only">{t("debts.table.actions")}</span>
            </TH>
          </TR>
        </THead>
        <tbody>
          {list.length === 0 ? (
            <TR>
              <TD colSpan={COLUMN_COUNT} className="p-0">
                {error ? (
                  <ErrorState inline error={error} onRetry={onRetry} />
                ) : (
                  <DebtEmptyRow title={emptyTitle} message={emptyMessage} />
                )}
              </TD>
            </TR>
          ) : null}

          {list.map((debt) => {
            const isOwedToYou = debt.direction === "OWED_TO_YOU";
            const isSettled = debt.settledAt !== null;
            const isWrittenOff = debt.writtenOffAt !== null;
            const overdue = isOverdue(debt, now);
            const hasInstallments = debt.totalInstallments > 1;
            const allPaid = debt.paidInstallments >= debt.totalInstallments;
            // Closed unpaid: show what was given up (struck through), not "$0".
            const left = isWrittenOff ? calcRemaining(debt) : leftAmount(debt);
            const due = dueInfo(debt.dueAt, now);
            const progressPct = paidPercent(debt);
            const progressLabel = isSettled
              ? t("debts.table.progressPaid")
              : hasPartialInstallment(debt)
                ? t("debts.table.progressPartial", {
                    paid: debt.paidInstallments,
                    total: debt.totalInstallments,
                  })
                : `${debt.paidInstallments}/${debt.totalInstallments}`;

            return (
              <TR
                key={debt.id}
                onClick={() => onSelect(debt.id)}
                className={cn("cursor-pointer", overdue && "bg-destructive/5")}
              >
                <TD>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        isOwedToYou
                          ? "bg-success/20 text-success"
                          : "bg-destructive/20 text-destructive",
                      )}
                    >
                      {initials(debt.counterparty)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {debt.counterparty}
                      </p>
                      {debt.title ? (
                        <p className="truncate text-xs text-muted-foreground">{debt.title}</p>
                      ) : null}
                    </div>
                  </div>
                </TD>

                <TD>
                  <div className="flex items-center gap-3">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-track">
                      <span
                        className={cn(
                          "block h-full rounded-full transition-all",
                          isWrittenOff ? "bg-muted-foreground/40" : "bg-primary",
                        )}
                        style={{ width: `${progressPct}%` }}
                      />
                    </span>
                    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {progressLabel}
                    </span>
                  </div>
                </TD>

                <TD>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={isOwedToYou ? "success" : "danger"}>
                      {t(`debts.direction.${debt.direction}`)}
                    </Badge>
                    {isWrittenOff ? (
                      <Badge variant="neutral">{t(`debts.writeOff.badge.${debt.direction}`)}</Badge>
                    ) : null}
                  </span>
                </TD>

                <TD numeric>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      isWrittenOff
                        ? "text-muted-foreground line-through"
                        : isOwedToYou
                          ? "text-success"
                          : "text-destructive",
                    )}
                  >
                    {isWrittenOff ? "" : isOwedToYou ? "+" : "−"}
                    {formatMoney(left, { locale: i18n.language, currency: debt.currency })}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {t("debts.table.ofTotal", {
                      total: formatMoney(debt.principal, {
                        locale: i18n.language,
                        currency: debt.currency,
                      }),
                    })}
                  </span>
                </TD>

                <TD>
                  {isSettled ? (
                    <span className="text-muted-foreground">
                      {t("debts.card.settledOn", {
                        date: formatDebtDate(debt.settledAt!, i18n.language),
                      })}
                    </span>
                  ) : isWrittenOff ? (
                    <span className="text-muted-foreground">
                      {t(`debts.writeOff.on.${debt.direction}`, {
                        date: formatDebtDate(debt.writtenOffAt!, i18n.language),
                      })}
                    </span>
                  ) : debt.dueAt ? (
                    <>
                      <span className={cn(overdue ? "font-medium text-destructive" : undefined)}>
                        {formatDebtDate(debt.dueAt, i18n.language)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {overdue
                          ? t("debts.due.agoDays", { count: due.days ?? 0 })
                          : due.days === 0
                            ? t("debts.due.today")
                            : t("debts.due.inDays", { count: due.days ?? 0 })}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("debts.due.noDate")}</span>
                  )}
                </TD>

                <TD numeric>
                  <div
                    className="flex items-center justify-end gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isSettled && !isWrittenOff ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t(
                          hasInstallments && !allPaid
                            ? "debts.card.registerPayment"
                            : "debts.card.markPaid",
                        )}
                        className="text-accent hover:bg-accent/10"
                        onClick={() => onPay(debt)}
                      >
                        <Banknote className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("common.edit")}
                      onClick={() => onEdit(debt)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("common.delete")}
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(debt.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
