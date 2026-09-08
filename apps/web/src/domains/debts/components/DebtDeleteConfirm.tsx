import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { initials, leftAmount } from "../lib/debtMetrics";

interface Props {
  /** The debt to delete, or null when nothing is being deleted. */
  debt: debts.Debt | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

/**
 * Confirm deleting a debt — showing WHICH one, same reasoning as
 * `TransactionDeleteConfirm`/`DeletePlanConfirm`: a bare "delete this?" makes
 * the user trust their memory of which row they clicked, right when being
 * specific matters most.
 */
export function DebtDeleteConfirm({ debt, onOpenChange, onConfirm, loading = false }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const isOwedToYou = debt?.direction === "OWED_TO_YOU";
  const left = debt ? leftAmount(debt) : "0";

  return (
    <ConfirmModal
      open={debt !== null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t("common.confirmDeleteTitle")}
      description={
        debt ? t("debts.delete.description", { name: debt.counterparty }) : t("common.confirmDelete")
      }
      loading={loading}
    >
      {debt ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              isOwedToYou ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive",
            )}
          >
            {initials(debt.counterparty)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {debt.counterparty}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(`debts.direction.${debt.direction}`)}
              {debt.totalInstallments > 1
                ? ` · ${t("debts.table.ofTotal", {
                    total: formatMoney(debt.principal, {
                      currency: debt.currency,
                      locale: i18n.language,
                    }),
                  })}`
                : ""}
            </span>
          </div>
          <span
            className={cn(
              "shrink-0 text-sm font-medium tabular-nums",
              isOwedToYou ? "text-success" : "text-destructive",
            )}
          >
            {formatMoney(left, { currency: debt.currency, locale: i18n.language })}
          </span>
        </div>
      ) : null}
    </ConfirmModal>
  );
}
