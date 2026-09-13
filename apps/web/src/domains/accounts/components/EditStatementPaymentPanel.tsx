import { Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { formatMoney, subtractMoney } from "@finance/money";

import { useCurrencies } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { FormSurface } from "../../../shared/ui/overlay";
import { useAccountMutations } from "../hooks/useAccounts";

/**
 * Correct what was actually paid on a settled period — a mistyped figure, or a
 * second transfer that the app never saw.
 *
 * Only the PAYMENT is editable here: the period's own total comes from its real
 * movements and is only ever recomputed ("Sincronizar pagos"), never typed in.
 * The panel therefore shows the total as a fixed row and asks for one number,
 * previewing what would be carried into the next period — the whole reason the
 * figure matters.
 */
export function EditStatementPaymentPanel({
  account,
  statement,
  onOpenChange,
}: Readonly<{
  account: accounts.BankAccount;
  statement: accounts.CreditStatement | null;
  onOpenChange: (v: boolean) => void;
}>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();
  const { updateStatementPayment } = useAccountMutations();
  const [amount, setAmount] = useState("");
  // Reopening on another period must not keep the previous one's figure — reset
  // during render (React's recommended pattern) rather than in an effect, which
  // would cascade an extra render on every open.
  const [seenStatementId, setSeenStatementId] = useState<string | null>(null);
  // Integer part only — same convention the amount inputs elsewhere in this
  // app use (`TransactionCreateModal`, `PayStatementPanel`'s custom mode): a
  // decimal money string ("54500.0000") displayed digit-by-digit is what
  // produced the garbled "54500,0000" this panel used to show. Comparing
  // dirtiness against the un-truncated `statement.paidAmount` would flag
  // "sin guardar" on open, before any real edit — the baseline has to be
  // this SAME truncated form.
  const initialAmount = statement?.paidAmount.split(".")[0] ?? "";
  if (statement && statement.id !== seenStatementId) {
    setSeenStatementId(statement.id);
    setAmount(initialAmount);
  }

  if (!statement) return null;

  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= Number(statement.amount);
  const leftover = valid ? subtractMoney(statement.amount, amount) : null;
  const locale = groupingLocaleFor(account.currency, i18n.language);
  const dirty = amount !== initialAmount;

  return (
    <FormSurface
      open={statement !== null}
      onOpenChange={onOpenChange}
      mode="edit"
      surface="panel"
      eyebrow={t("accounts.detail.editPaymentEyebrow")}
      title={t("accounts.detail.payPeriodTitle", {
        date: new Date(statement.periodStart).toLocaleDateString(i18n.language),
      })}
      description={t("accounts.detail.editPaymentDescription")}
      canSubmit={valid && dirty}
      dirty={dirty}
      submitting={updateStatementPayment.isPending}
      onSubmit={() =>
        updateStatementPayment.mutate(
          { id: account.id, statementId: statement.id, amount },
          {
            onSuccess: () => {
              toast.success(t("accounts.detail.editPaymentSuccess"));
              onOpenChange(false);
            },
            onError: (e) =>
              toast.error(
                t(`errors.${e instanceof ApiRequestError ? e.code : "INTERNAL_ERROR"}`, {
                  defaultValue: t("errors.INTERNAL_ERROR"),
                }),
              ),
          },
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("accounts.detail.payAmountLabel")}</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="shrink-0 text-2xl font-bold text-accent" aria-hidden>
                {resolveCurrencySymbol(account.currency, currencies, i18n.language)}
              </span>
              <input
                inputMode="numeric"
                value={formatAmountDisplay(amount, locale)}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                aria-label={t("accounts.detail.payAmountLabel")}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none"
              />
              <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
            </div>
          </div>

          {/* What the period is made of — same two rows `PayStatementPanel` opens
              with, so correcting a payment reads in the same terms as making one. */}
          <dl className="flex flex-col gap-1 border-t border-border pt-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("accounts.detail.billingAmount")}</dt>
              <dd className="font-medium tabular-nums">{fmt(statement.amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("accounts.detail.editPaymentCurrent")}</dt>
              <dd className="font-medium tabular-nums">{fmt(statement.paidAmount)}</dd>
            </div>
          </dl>
        </div>

        {/* The consequence, not a validation message: what the correction leaves
            owed in the NEXT period, which is where the shortfall lives. */}
        {leftover !== null ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-xs">
            <span className="text-muted-foreground">{t("accounts.detail.payRemainingAfter")}</span>
            <span className="font-medium tabular-nums text-warning">{fmt(leftover)}</span>
          </div>
        ) : null}

        <p className="border-l-2 border-brand/40 pl-3 text-xs text-muted-foreground">
          {t("accounts.detail.editPaymentCascadeHint")}
        </p>
      </div>
    </FormSurface>
  );
}
