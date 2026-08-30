import type { accounts as accountsContract, installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { useTranslation } from "react-i18next";

import { ConfirmModal } from "../../../shared/ui/overlay";
import { useInstallmentPlan } from "../hooks/useInstallments";

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
    />
  );
}
