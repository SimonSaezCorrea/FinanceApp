import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { DetailRow } from "../../../shared/ui/detail-row";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import type { TransactionFormValue } from "./TransactionFormPanel";

interface Props {
  value: TransactionFormValue;
  onChange: (patch: Partial<TransactionFormValue>) => void;
  accounts: accounts.BankAccount[];
  selectable: accounts.BankAccount[];
  /**
   * Opened from inside one account: it IS the origin, shown as a fixed value.
   * Switching it here would move the transfer out of the view it was created
   * from — same reason the ordinary form hides its account selector.
   */
  lockedFrom?: boolean;
}

/**
 * Source/destination accounts and both amounts of a transfer. No card field:
 * a transfer never touches a credit pool (FR-019), and the destination can never
 * be a `CREDIT_CARD` — money doesn't land in a credit line, paying one is a
 * statement payment, which has its own flow.
 */
export function TransferFields({
  value,
  onChange,
  accounts: all,
  selectable,
  lockedFrom = false,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const typeLabel = (accType: accounts.AccountType) => t(`accounts.type.${accType}`);

  // Both pickers share the same "Nombre / Tipo · Banco · Número" shape as the
  // ordinary account field — and each one excludes whatever the OTHER side
  // already picked, so the same account can't be both ends of its own transfer.
  const fromOptions = selectable
    .filter((a) => a.id !== value.toBankAccountId)
    .map((a) => ({ value: a.id, label: a.name, description: accountMetaLine(a, typeLabel) }));
  const toOptions = selectable
    .filter((a) => a.id !== value.bankAccountId && a.type !== "CREDIT_CARD")
    .map((a) => ({ value: a.id, label: a.name, description: accountMetaLine(a, typeLabel) }));

  return (
    <>
      <DetailRow label={t("transactions.form.fromAccount")}>
        {lockedFrom ? (
          <span className="font-medium">
            {all.find((a) => a.id === value.bankAccountId)?.name ?? "—"}
          </span>
        ) : (
          <SearchableSelect
            id="tx-from"
            variant="inline"
            className="w-auto"
            value={value.bankAccountId}
            onChange={(id) => {
              const acc = all.find((a) => a.id === id);
              onChange({
                bankAccountId: id,
                cardId: "",
                ...(acc ? { currency: acc.currency } : {}),
              });
            }}
            options={fromOptions}
            placeholder={t("transactions.form.selectAccount")}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("transactions.form.fromAccount")}
          />
        )}
      </DetailRow>

      <DetailRow label={t("transactions.form.toAccount")}>
        <SearchableSelect
          id="tx-to"
          variant="inline"
          className="w-auto"
          value={value.toBankAccountId}
          onChange={(toBankAccountId) => onChange({ toBankAccountId })}
          options={toOptions}
          placeholder={t("transactions.form.selectAccount")}
          searchPlaceholder={t("common.search")}
          noResultsLabel={t("common.noResults")}
          aria-label={t("transactions.form.toAccount")}
        />
      </DetailRow>
    </>
  );
}
