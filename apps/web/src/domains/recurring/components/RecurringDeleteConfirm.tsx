import { useTranslation } from "react-i18next";

import type { recurring } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { CategoryIcon } from "../../../shared/ui/category-icon";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { monthlyAmount } from "../lib/recurringMetrics";

interface Props {
  /** The series to delete, or null when nothing is being deleted. */
  recurringExpense: recurring.RecurringExpense | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

/**
 * Confirm deleting a recurring series — showing WHICH one, same reasoning as
 * `DebtDeleteConfirm`/`DeletePlanConfirm`/`TransactionDeleteConfirm`: a bare
 * "delete this?" makes the user trust their memory of which row they
 * clicked, right when being specific matters most.
 */
export function RecurringDeleteConfirm({
  recurringExpense: r,
  onOpenChange,
  onConfirm,
  loading = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  return (
    <ConfirmModal
      open={r !== null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t("common.confirmDeleteTitle")}
      description={
        r ? t("recurring.delete.description", { name: r.label }) : t("common.confirmDelete")
      }
      loading={loading}
    >
      {r ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
            <CategoryIcon category={r.category} className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{r.label}</span>
            <span className="text-xs text-muted-foreground">
              {t(`common.frequency.${r.frequency}`)}
              {r.category ? ` · ${r.category}` : ""}
            </span>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
            {formatMoney(monthlyAmount(r), { currency: r.currency, locale: i18n.language })}
          </span>
        </div>
      ) : null}
    </ConfirmModal>
  );
}
