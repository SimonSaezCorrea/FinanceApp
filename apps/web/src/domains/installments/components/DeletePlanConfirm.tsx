import type { accounts as accountsContract, installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { useTranslation } from "react-i18next";

import { CategoryIcon } from "../../../shared/ui/category-icon";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { useInstallmentPlan } from "../hooks/useInstallments";
import { paidCount } from "../lib/installmentMetrics";

interface Props {
  /** The plan to delete, or null when nothing is being deleted. */
  plan: installments.InstallmentPlan | null;
  accounts: accountsContract.BankAccount[];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

/**
 * Deleting a plan is not an ordinary delete: it erases real movements and gives real
 * balances back (FR-050a). So the confirmation says exactly that, with the counts and
 * the figures, BEFORE it happens (FR-050b).
 *
 * The impact comes from the detail endpoint — the same computation the delete itself
 * runs (`planDeletionReversal`), which is what stops the promise and the effect from
 * drifting apart. While it loads, the dialog says the impact is still being read
 * rather than showing a reassuring zero.
 */
export function DeletePlanConfirm({
  plan,
  accounts,
  onOpenChange,
  onConfirm,
  loading = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const detail = useInstallmentPlan(plan?.id ?? null);
  const impact = detail.data?.deletionImpact ?? null;

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.name ?? t("installments.delete.unknownAccount");

  const description = (() => {
    if (plan === null) return "";
    if (detail.isLoading) return t("installments.delete.loadingImpact");
    if (impact === null || impact.movementCount === 0) {
      return t("installments.delete.noMovements");
    }
    const restorations = impact.balanceRestorations
      .map(
        (r) =>
          `${accountName(r.accountId)}: ${formatMoney(r.amount, {
            currency: r.currency,
            locale: i18n.language,
          })}`,
      )
      .join(" · ");
    return [
      t("installments.delete.movements", { count: impact.movementCount }),
      restorations ? t("installments.delete.restores", { restorations }) : null,
    ]
      .filter(Boolean)
      .join(" ");
  })();

  return (
    <ConfirmModal
      open={plan !== null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t("installments.delete.title", { title: plan?.title ?? "" })}
      description={description}
      // The impact is the whole point of this dialog: confirming before it has been
      // read would be confirming something the user was never shown.
      loading={loading || detail.isLoading}
    >
      {/* Which plan, in numbers — the title alone doesn't say the amount or how
          far along it is, and a delete confirmation is exactly the moment
          that matters most. */}
      {plan ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-chip text-muted-foreground">
            <CategoryIcon category={plan.category} className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{plan.title}</span>
            <span className="text-xs text-muted-foreground">
              {t("installments.delete.summary", {
                paid: paidCount(plan),
                total: plan.installmentCount,
              })}
            </span>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
            {formatMoney(plan.totalPrincipal, { currency: plan.currency, locale: i18n.language })}
          </span>
        </div>
      ) : null}
    </ConfirmModal>
  );
}
