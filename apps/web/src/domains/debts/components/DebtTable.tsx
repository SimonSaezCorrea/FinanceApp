import { CircleCheck, Pencil, PlusCircle, RotateCcw, Trash2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { EmptyState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";

interface DebtTableProps {
  debts: debts.Debt[];
  onEdit: (debt: debts.Debt) => void;
  onDelete: (id: string) => void;
  onSettle: (id: string) => void;
  onUnsettle: (id: string) => void;
  onRegisterPayment: (id: string) => void;
  onUndoPayment: (id: string) => void;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DebtTable({
  debts: list,
  onEdit,
  onDelete,
  onSettle,
  onUnsettle,
  onRegisterPayment,
  onUndoPayment,
}: DebtTableProps) {
  const { t, i18n } = useTranslation();

  if (list.length === 0) return <EmptyState title={t("debts.empty")} />;

  const now = new Date();

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-10" />
          <TH>{t("debts.table.person")}</TH>
          <TH>{t("debts.table.concept")}</TH>
          <TH>{t("debts.table.type")}</TH>
          <TH>{t("debts.table.due")}</TH>
          <TH numeric>{t("debts.table.amount")}</TH>
          <TH className="w-36" />
        </TR>
      </THead>
      <tbody>
        {list.map((debt) => {
          const initial = debt.counterparty.charAt(0).toUpperCase();
          const isOwedToYou = debt.direction === "OWED_TO_YOU";
          const hasInstallments = debt.totalInstallments > 1;
          const isSettled = debt.settledAt !== null;
          const isOverdue = !isSettled && debt.dueAt !== null && new Date(debt.dueAt) < now;
          const allPaid = debt.paidInstallments >= debt.totalInstallments;

          return (
            <TR key={debt.id} className={cn(isSettled && "opacity-60")}>
              <TD>
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                    isOwedToYou
                      ? "bg-success/20 text-success"
                      : "bg-destructive/20 text-destructive",
                  )}
                >
                  {initial}
                </div>
              </TD>

              <TD>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{debt.counterparty}</span>
                  {hasInstallments ? (
                    <span className="text-xs text-muted-foreground">
                      {t("debts.card.installments", {
                        paid: debt.paidInstallments,
                        total: debt.totalInstallments,
                      })}
                    </span>
                  ) : null}
                </div>
              </TD>

              <TD className="text-muted-foreground">
                {debt.notes ?? <span className="opacity-40">—</span>}
              </TD>

              <TD>
                <Badge variant={isOwedToYou ? "success" : "danger"}>
                  {t(`debts.direction.${debt.direction}`)}
                </Badge>
              </TD>

              <TD
                className={cn("text-muted-foreground", isOverdue && "font-medium text-destructive")}
              >
                {isSettled
                  ? t("debts.card.settledOn", {
                      date: formatDate(debt.settledAt!, i18n.language),
                    })
                  : debt.dueAt
                    ? formatDate(debt.dueAt, i18n.language)
                    : t("debts.table.noDue")}
              </TD>

              <TD numeric className={isOwedToYou ? "text-success" : "text-destructive"}>
                {isOwedToYou ? "+" : "−"}
                {formatMoney(debt.principal, {
                  currency: debt.currency,
                  locale: i18n.language,
                })}
              </TD>

              <TD>
                <div className="flex items-center justify-end gap-0.5">
                  {isSettled ? (
                    <ActionBtn onClick={() => onUnsettle(debt.id)} label={t("debts.card.unsettle")}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </ActionBtn>
                  ) : hasInstallments ? (
                    <>
                      {!allPaid && (
                        <ActionBtn
                          onClick={() => onRegisterPayment(debt.id)}
                          label={t("debts.card.registerPayment")}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                        </ActionBtn>
                      )}
                      {debt.paidInstallments > 0 && (
                        <ActionBtn
                          onClick={() => onUndoPayment(debt.id)}
                          label={t("debts.card.undoPayment")}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </ActionBtn>
                      )}
                    </>
                  ) : (
                    <ActionBtn onClick={() => onSettle(debt.id)} label={t("debts.card.markPaid")}>
                      <CircleCheck className="h-3.5 w-3.5" />
                    </ActionBtn>
                  )}
                  <ActionBtn onClick={() => onEdit(debt)} label={t("common.edit")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </ActionBtn>
                  <ActionBtn
                    onClick={() => onDelete(debt.id)}
                    label={t("common.delete")}
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ActionBtn>
                </div>
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

interface ActionBtnProps {
  onClick: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

function ActionBtn({ onClick, label, children, className }: ActionBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}
