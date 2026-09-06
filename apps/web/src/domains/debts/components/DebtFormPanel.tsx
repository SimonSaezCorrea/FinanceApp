import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, debts, installments } from "@finance/contracts";
import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { currencyPickerLabel } from "../../../shared/lib/currencyLabel";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import {
  FormCounterField,
  FormDateField,
  FormNotice,
  FormSelectField,
  FormTextField,
} from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";
import { Segmented } from "../../../shared/ui/segmented";
import { SearchableSelect } from "../../../shared/ui/searchable-select";

export interface DebtFormValue {
  direction: debts.DebtDirection;
  counterparty: string;
  amount: string;
  currency: string;
  /** The FIRST instalment's due date (or the single payment's date) —
   * `debtSchedule` reads this the same way. */
  dueAt: string;
  totalInstallments: number;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  /** Doubles as the handoff's "Concepto" field: the real `Debt` model has a
   * single free-text `notes` column, not a separate concept + notes pair, so
   * there is nothing to fuse — this one field IS both. */
  notes: string;
  /** The bank account this debt is associated with — persisted on `Debt`
   * (`paymentAccountId`). Purely informational: `register-payment`/`settle`
   * still take no body and move no real money. `""` = none. */
  paymentAccountId: string;
}

const FREQS: installments.InstallmentFrequency[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  value: DebtFormValue;
  onChange: (patch: Partial<DebtFormValue>) => void;
  accounts: accountsContract.BankAccount[];
  onSubmit: () => void;
  submitting?: boolean;
  dirty?: boolean;
}

/**
 * Creating and editing a debt: one sheet-style panel — fields as rows
 * separated by a top border, no boxed inputs — matching the handoff exactly.
 *
 * "Tipo" is a full-width nav-style Segmented switch (Debes/Te deben) right
 * under the amount — the same shape a movement's Gasto/Ingreso/Traspaso
 * switch uses, colored the same way (destructive/success) — rather than a
 * row with a compact pill: it's the first real decision in the form, same
 * weight the movement's own type switch gets.
 *
 * Periodicity offers only the four frequencies the real model has
 * (DAILY/WEEKLY/MONTHLY/YEARLY) — the handoff's own cycle also lists
 * "Quincenal", which isn't a `RecurrenceFrequency`/`InstallmentFrequency`
 * value anywhere in this app. A biweekly schedule is still expressible as
 * WEEKLY + "repetir cada 2 semanas", so nothing is actually lost by dropping
 * it as a separate option.
 */
export function DebtFormPanel({
  open,
  onOpenChange,
  mode,
  value,
  onChange,
  accounts,
  onSubmit,
  submitting = false,
  dirty = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();
  const creating = mode === "create";
  const isOwedToYou = value.direction === "OWED_TO_YOU";
  const personLabel = isOwedToYou ? t("debts.form.personOwedToYou") : t("debts.form.personYouOwe");
  const hasInstallments = value.totalInstallments > 1;
  // Same red/green the Debes/Te deben switch itself uses — the amount reads
  // as a debt owed or owed-to-you from across the panel, the same way a
  // movement's own amount reads red/green/blue from its type switch.
  const amountToneClass = isOwedToYou ? "text-success" : "text-destructive";
  const amountPlaceholderToneClass = isOwedToYou
    ? "placeholder:text-success/50"
    : "placeholder:text-destructive/50";

  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: currencyPickerLabel(c.code),
  }));
  if (value.currency && !currencyOptions.some((o) => o.value === value.currency)) {
    currencyOptions.unshift({ value: value.currency, label: currencyPickerLabel(value.currency) });
  }

  const accountOptions = [
    { value: "", label: t("debts.form.noAccount") },
    ...accounts.map((a) => ({
      value: a.id,
      label: a.name,
      description: accountMetaLine(a, (type) => t(`accounts.type.${type}`)),
    })),
  ];

  const canSubmit =
    value.counterparty.trim().length > 0 &&
    value.amount.trim().length > 0 &&
    value.frequencyInterval >= 1 &&
    value.totalInstallments >= 1;

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      surface="panel"
      eyebrow={creating ? t("debts.form.eyebrowCreate") : t("debts.form.eyebrowEdit")}
      title={<span className="sr-only">{creating ? t("debts.new") : value.counterparty}</span>}
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      dirty={dirty}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-5">
        <input
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder={t("debts.form.concept")}
          aria-label={t("debts.form.concept")}
          className="w-full border-0 bg-transparent p-0 text-[28px] font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />

        <div className="flex items-baseline gap-2 border-b border-border pb-3">
          <span className={cn("shrink-0 text-3xl font-bold", amountToneClass)} aria-hidden>
            {resolveCurrencySymbol(value.currency, currencies, i18n.language)}
          </span>
          <input
            inputMode="numeric"
            value={formatAmountDisplay(
              value.amount,
              groupingLocaleFor(value.currency, i18n.language),
            )}
            onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
            placeholder="0"
            aria-label={t("debts.form.amount")}
            className={cn(
              "min-w-0 max-w-[220px] flex-1 border-0 bg-transparent p-0 text-3xl font-bold tabular-nums focus-visible:outline-none",
              amountToneClass,
              amountPlaceholderToneClass,
            )}
          />
          <SearchableSelect
            id="debt-currency"
            variant="inline"
            className="ml-auto w-auto shrink-0"
            value={value.currency}
            onChange={(currency) => onChange({ currency })}
            options={currencyOptions}
            displayValue={value.currency}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("debts.form.currency")}
          />
        </div>

        <Segmented
          aria-label={t("debts.form.typeLabel")}
          value={value.direction}
          onChange={(direction) => onChange({ direction })}
          className="w-full"
          variant="neutral"
          options={[
            {
              value: "YOU_OWE",
              label: t("debts.form.directionOptions.YOU_OWE"),
              activeClassName: "bg-destructive/15 font-semibold text-destructive",
            },
            {
              value: "OWED_TO_YOU",
              label: t("debts.form.directionOptions.OWED_TO_YOU"),
              activeClassName: "bg-success/15 font-semibold text-success",
            },
          ]}
        />

        <div className="flex flex-col">
          <FormTextField
            label={personLabel}
            value={value.counterparty}
            onChange={(counterparty) => onChange({ counterparty })}
            placeholder={t("debts.form.personPlaceholder")}
          />

          <FormSelectField
            id="debt-account"
            label={t("debts.form.account")}
            value={value.paymentAccountId}
            onChange={(paymentAccountId) => onChange({ paymentAccountId })}
            options={accountOptions}
          />

          <FormCounterField
            label={t("debts.form.installments")}
            min={1}
            max={600}
            value={String(value.totalInstallments)}
            onChange={(count) =>
              onChange({ totalInstallments: Math.max(1, Number.parseInt(count, 10) || 1) })
            }
          />

          <FormDateField
            label={t("debts.form.dueAt")}
            icon={CalendarClock}
            value={value.dueAt}
            onChange={(dueAt) => onChange({ dueAt })}
          />

          {hasInstallments ? (
            <>
              <FormSelectField
                id="debt-frequency"
                label={t("debts.form.frequency")}
                value={value.frequency}
                onChange={(frequency) =>
                  onChange({ frequency: frequency as installments.InstallmentFrequency })
                }
                options={FREQS.map((f) => ({ value: f, label: t(`common.frequency.${f}`) }))}
              />
              <FormCounterField
                label={t("debts.form.frequencyInterval")}
                min={1}
                max={999}
                value={String(value.frequencyInterval)}
                onChange={(interval) =>
                  onChange({ frequencyInterval: Math.max(1, Number.parseInt(interval, 10) || 1) })
                }
                unit={t(`debts.form.intervalUnit.${value.frequency}`, {
                  count: value.frequencyInterval,
                })}
              />
            </>
          ) : null}
        </div>

        <FormNotice icon={CalendarClock}>
          {hasInstallments ? t("debts.form.scheduleNoteMulti") : t("debts.form.scheduleNoteSingle")}
        </FormNotice>
      </div>
    </FormSurface>
  );
}

/** A blank debt, dated today. `currency` defaults to the user's own
 * `preferredCurrency` (falling back to CLP) instead of a hardcoded value — the
 * same convention `AccountsRoute`'s `primaryCurrency` already uses.
 * `paymentAccountId` defaults to the caller's own choice (e.g. the first
 * account in that currency) — see `DebtsRoute.openCreate`. */
export function emptyDebtForm(
  today: string,
  currency = "CLP",
  paymentAccountId = "",
): DebtFormValue {
  return {
    direction: "YOU_OWE",
    counterparty: "",
    amount: "",
    currency,
    dueAt: today,
    totalInstallments: 1,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    notes: "",
    paymentAccountId,
  };
}

/** The form as it opens on an existing debt. */
export function debtFormFrom(debt: debts.Debt, today: string): DebtFormValue {
  return {
    direction: debt.direction,
    counterparty: debt.counterparty,
    amount: debt.principal,
    currency: debt.currency,
    dueAt: debt.dueAt ? debt.dueAt.slice(0, 10) : today,
    totalInstallments: debt.totalInstallments,
    frequency: debt.frequency,
    frequencyInterval: debt.frequencyInterval,
    notes: debt.notes ?? "",
    paymentAccountId: debt.paymentAccountId ?? "",
  };
}
