import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { EmptyState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { monthlyAmount, nextDuePayment } from "../lib/installmentMetrics";

interface InstallmentTableProps {
  plans: installments.InstallmentPlan[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (plan: installments.InstallmentPlan) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InstallmentTable({
  plans,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: InstallmentTableProps) {
  const { t, i18n } = useTranslation();

  if (plans.length === 0) return <EmptyState title={t("installments.empty")} />;

  return (
    <Table>
      <THead>
        <TR>
          <TH>{t("installments.table.plan")}</TH>
          <TH>{t("installments.table.progress")}</TH>
          <TH>{t("installments.table.nextDue")}</TH>
          <TH numeric>{t("installments.table.total")}</TH>
          <TH numeric>{t("installments.table.monthly")}</TH>
          <TH className="w-20" />
        </TR>
      </THead>
      <tbody>
        {plans.map((plan) => {
          const paidCount = plan.payments.filter((p) => p.paidAt !== null).length;
          const nextDue = nextDuePayment(plan.payments);
          const monthly = monthlyAmount(plan);
          const isSelected = plan.id === selectedId;

          return (
            <TR
              key={plan.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/40",
                isSelected && "bg-muted/60",
              )}
              onClick={() => onSelect(plan.id)}
            >
              <TD>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{plan.title}</span>
                  {plan.notes ? (
                    <span className="text-xs text-muted-foreground">{plan.notes}</span>
                  ) : null}
                </div>
              </TD>

              <TD>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm">
                    {t("installments.planCard.progress", {
                      paid: paidCount,
                      total: plan.installmentCount,
                    })}
                  </span>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, (paidCount / plan.installmentCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </TD>

              <TD className="text-muted-foreground">
                {nextDue ? formatDate(nextDue.dueDate, i18n.language) : "—"}
              </TD>

              <TD numeric className="tabular-nums">
                {formatMoney(plan.totalPrincipal, {
                  locale: i18n.language,
                  currency: plan.currency,
                })}
              </TD>

              <TD numeric className="text-muted-foreground tabular-nums">
                {formatMoney(monthly, { locale: i18n.language, currency: plan.currency })}
              </TD>

              <TD>
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(plan);
                    }}
                    aria-label={t("common.edit")}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(plan.id);
                    }}
                    aria-label={t("common.delete")}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}
