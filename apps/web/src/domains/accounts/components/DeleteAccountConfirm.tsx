import { useState } from "react";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { useTranslation } from "react-i18next";

import { ConfirmModal } from "../../../shared/ui/overlay";
import { Switch } from "../../../shared/ui/switch";
import { useAccountDeletionImpact, useAccountMutations, useAccounts } from "../hooks/useAccounts";

type Option = keyof accounts.RemoveAccount;

interface Row {
  key: Option;
  count: number;
  label: string;
  hints: (string | null)[];
}

const NONE: accounts.RemoveAccount = {
  movements: false,
  installmentPlans: false,
  recurring: false,
  savingsEntries: false,
};

const DEFAULTS: accounts.RemoveAccount = { ...NONE, movements: true };

interface Props {
  /** The account to delete; null while nothing is being deleted. */
  account: accounts.BankAccount | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
  onError: (err: unknown) => void;
}

/**
 * Deleting an account, choosing what goes with it. Each group shows how much it
 * holds — counted by the same server computation the delete runs — and, where
 * deleting it gives money back to another account, how much and to which one.
 * Whatever isn't chosen stays in the app, just without the account.
 *
 * Movements start ON: left behind, they keep counting in the month's totals with
 * no account to belong to, which is rarely what anyone deleting an account wants.
 */
export function DeleteAccountConfirm({
  account,
  onOpenChange,
  onDeleted,
  onError,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const impact = useAccountDeletionImpact(account?.id ?? null);
  const all = useAccounts();
  const { remove } = useAccountMutations();
  // The choice belongs to the account it was made for: opening the dialog on
  // another one (or on the same one later) starts from the defaults again.
  const [choice, setChoice] = useState<{
    accountId: string | null;
    options: accounts.RemoveAccount;
  }>({ accountId: null, options: DEFAULTS });
  const accountId = account?.id ?? null;
  const options = choice.accountId === accountId ? choice.options : DEFAULTS;
  const setOption = (key: Option, value: boolean) =>
    setChoice({ accountId, options: { ...options, [key]: value } });

  const data = impact.data;
  const accountName = (id: string) =>
    all.data?.find((a) => a.id === id)?.name ?? t("accounts.deleteWith.unknownAccount");
  const restores = (list: accounts.AccountRestoration[]) =>
    list.length === 0
      ? null
      : t("accounts.deleteWith.restores", {
          restorations: list
            .map(
              (r) =>
                `${accountName(r.accountId)}: ${formatMoney(r.amount, {
                  currency: r.currency,
                  locale: i18n.language,
                })}`,
            )
            .join(" · "),
        });

  const candidates: Row[] = data
    ? [
        {
          key: "movements",
          count: data.movements.count + data.movements.paymentsFromOtherAccounts,
          label: t("accounts.deleteWith.movements", { count: data.movements.count }),
          hints: [
            data.movements.transfers > 0
              ? t("accounts.deleteWith.transfers", { count: data.movements.transfers })
              : null,
            data.movements.paymentsFromOtherAccounts > 0
              ? t("accounts.deleteWith.payments", {
                  count: data.movements.paymentsFromOtherAccounts,
                })
              : null,
            restores(data.movements.restorations),
          ],
        },
        {
          key: "installmentPlans",
          count: data.installmentPlans.count,
          label: t("accounts.deleteWith.installmentPlans", { count: data.installmentPlans.count }),
          hints: [restores(data.installmentPlans.restorations)],
        },
        {
          key: "recurring",
          count: data.recurring.count,
          label: t("accounts.deleteWith.recurring", { count: data.recurring.count }),
          hints: [],
        },
        {
          key: "savingsEntries",
          count: data.savingsEntries.count,
          label: t("accounts.deleteWith.savingsEntries", { count: data.savingsEntries.count }),
          hints: [],
        },
      ]
    : [];
  const rows = candidates.filter((r) => r.count > 0);

  return (
    <ConfirmModal
      open={account !== null}
      onOpenChange={onOpenChange}
      title={t("accounts.deleteConfirm")}
      description={t("accounts.deleteConfirmDescription")}
      confirmLabel={t("accounts.actions.delete")}
      // Confirming before the impact was read would be confirming something the
      // user was never shown.
      loading={remove.isPending || impact.isLoading}
      onConfirm={() => {
        if (!account) return;
        // Only groups that exist are sent: an option for nothing is noise.
        const chosen = Object.fromEntries(
          (Object.keys(NONE) as Option[]).map((k) => [
            k,
            options[k] && rows.some((r) => r.key === k),
          ]),
        ) as accounts.RemoveAccount;
        remove.mutate({ id: account.id, options: chosen }, { onSuccess: onDeleted, onError });
      }}
    >
      {impact.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("accounts.deleteWith.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("accounts.deleteWith.nothing")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("accounts.deleteWith.title")}
          </span>
          {rows.map((row) => (
            <label
              key={row.key}
              className="flex cursor-pointer items-start justify-between gap-3 rounded-md border bg-muted/30 p-3"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                {row.hints
                  .filter((h): h is string => h !== null)
                  .map((h) => (
                    <span key={h} className="text-xs text-muted-foreground">
                      {h}
                    </span>
                  ))}
              </span>
              <Switch
                aria-label={row.label}
                checked={options[row.key]}
                onCheckedChange={(checked) => setOption(row.key, checked)}
              />
            </label>
          ))}
        </div>
      )}
      {data && data.linkedDebts.count > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("accounts.deleteWith.linkedDebts", { count: data.linkedDebts.count })}
        </p>
      ) : null}
    </ConfirmModal>
  );
}
