import { useTranslation } from "react-i18next";

import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { ConfirmModal } from "../../../shared/ui/overlay";

/**
 * Confirm deleting a movement — showing WHICH movement.
 *
 * A bare "delete this movement?" asks the user to trust that the row they meant
 * is the row that will go, which in a list of near-identical amounts is exactly
 * the moment to be specific. It also states the consequence: deleting gives the
 * money back to the account's balance (and to the credit pool when the movement
 * used one), which is not obvious from a table of rows.
 */
export function TransactionDeleteConfirm({
  transaction,
  accounts: accountList,
  loading,
  onOpenChange,
  onConfirm,
}: Readonly<{
  transaction: transactions.Transaction | null;
  /** For naming the account/card the movement belongs to. */
  accounts: accounts.BankAccount[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}>) {
  const { t, i18n } = useTranslation();

  const account = transaction
    ? accountList.find((a) => a.id === transaction.bankAccountId)
    : undefined;
  const card = account?.cards.find((c) => c.id === transaction?.cardId);
  const isIncome = transaction?.type === "INCOME";

  return (
    <ConfirmModal
      open={transaction !== null}
      onOpenChange={onOpenChange}
      title={t("transactions.deleteConfirm")}
      description={t("transactions.deleteConfirmDescription")}
      confirmLabel={t("common.delete")}
      loading={loading}
      onConfirm={onConfirm}
    >
      {transaction ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">
              {transaction.description ?? transaction.category ?? t("transactions.uncategorized")}
            </span>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                isIncome ? "text-success" : "text-destructive",
              )}
            >
              {isIncome ? "+" : "−"}
              {formatMoney(transaction.amount, {
                locale: i18n.language,
                currency: transaction.currency,
              })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{new Date(transaction.occurredAt).toLocaleDateString(i18n.language)}</span>
            {account ? <span>· {account.name}</span> : null}
            {card ? <span>· •••• {card.last4}</span> : null}
          </div>
        </div>
      ) : null}
    </ConfirmModal>
  );
}
