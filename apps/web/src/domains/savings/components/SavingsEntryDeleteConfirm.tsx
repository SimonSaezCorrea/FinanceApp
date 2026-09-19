import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ConfirmModal } from "../../../shared/ui/overlay";

interface Props {
  /** The aporte to delete, or null when nothing is being deleted. */
  entry: savings.SavingsEntry | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

/**
 * Confirm deleting an aporte — reverses the real movement and the account
 * balance it created (see CLAUDE.md's savings-entry bullet), so the
 * confirmation says exactly what's at stake, same reasoning as
 * `RecurringDeleteConfirm`/`DebtDeleteConfirm`.
 */
export function SavingsEntryDeleteConfirm({
  entry,
  onOpenChange,
  onConfirm,
  loading = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  return (
    <ConfirmModal
      open={entry !== null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t("common.confirmDeleteTitle")}
      description={
        entry
          ? t("savings.delete.entryDescription", {
              amount: formatMoney(entry.amount, {
                currency: entry.currency,
                locale: i18n.language,
              }),
            })
          : t("common.confirmDelete")
      }
      loading={loading}
    />
  );
}
