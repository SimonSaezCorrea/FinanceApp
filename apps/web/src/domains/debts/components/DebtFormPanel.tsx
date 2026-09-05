import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, debts, installments } from "@finance/contracts";
import { currencySymbol } from "@finance/money";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { useCurrencies } from "../../reference/hooks/useReference";
import { cn } from "../../../shared/lib/cn";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { DateField } from "../../../shared/ui/date-field";
import { DetailRow } from "../../../shared/ui/detail-row";
import { Input } from "../../../shared/ui/input";
import { NumberField } from "../../../shared/ui/number-field";
import { FormSurface } from "../../../shared/ui/overlay";
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
 * The "Tipo" row is a two-position pill switch (Debes/Te deben), not a
 * dropdown — a single button with a chevron read as "opens a menu" when it
 * only ever flips between two values, which is what a switch communicates
 * instead.
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

  const currencyOptions = (currencies ?? []).map((c) => ({ value: c.code, label: c.code }));
  if (value.currency && !currencyOptions.some((o) => o.value === value.currency)) {
    currencyOptions.unshift({ value: value.currency, label: value.currency });
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
          <span className="shrink-0 text-3xl font-bold text-muted-foreground" aria-hidden>
            {currencySymbol(value.currency, i18n.language)}
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
            className="min-w-0 max-w-[220px] flex-1 border-0 bg-transparent p-0 text-3xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
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

        <div className="flex flex-col">
          <DetailRow label={t("debts.form.typeLabel")}>
            <div className="inline-flex items-center rounded-full border border-input bg-muted p-[2px] text-xs font-medium">
              <button
                type="button"
                onClick={() => onChange({ direction: "YOU_OWE" })}
                aria-pressed={!isOwedToYou}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors",
                  !isOwedToYou
                    ? "bg-destructive text-destructive-foreground"
                    : "text-muted-foreground",
                )}
              >
                {t("debts.form.directionOptions.YOU_OWE")}
              </button>
              <button
                type="button"
                onClick={() => onChange({ direction: "OWED_TO_YOU" })}
                aria-pressed={isOwedToYou}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors",
                  isOwedToYou ? "bg-success text-success-foreground" : "text-muted-foreground",
                )}
              >
                {t("debts.form.directionOptions.OWED_TO_YOU")}
              </button>
            </div>
          </DetailRow>

          <DetailRow label={personLabel}>
            <Input
              value={value.counterparty}
              onChange={(e) => onChange({ counterparty: e.target.value })}
              placeholder={t("debts.form.personPlaceholder")}
              aria-label={personLabel}
              className="h-8 w-full max-w-[13rem] border-0 bg-transparent text-right shadow-none focus-visible:outline-none focus-visible:ring-0"
            />
          </DetailRow>

          <DetailRow label={t("debts.form.account")}>
            <SearchableSelect
              id="debt-account"
              variant="inline"
              className="w-auto"
              value={value.paymentAccountId}
              onChange={(paymentAccountId) => onChange({ paymentAccountId })}
              options={accountOptions}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("debts.form.account")}
            />
          </DetailRow>

          <DetailRow label={t("debts.form.installments")}>
            <NumberField
              min={1}
              max={600}
              value={String(value.totalInstallments)}
              onChange={(count) =>
                onChange({ totalInstallments: Math.max(1, Number.parseInt(count, 10) || 1) })
              }
              aria-label={t("debts.form.installments")}
            />
          </DetailRow>

          <DetailRow label={t("debts.form.dueAt")}>
            <DateField
              variant="inline"
              icon={CalendarClock}
              value={value.dueAt}
              onChange={(dueAt) => onChange({ dueAt })}
              aria-label={t("debts.form.dueAt")}
            />
          </DetailRow>

          {hasInstallments ? (
            <>
              <DetailRow label={t("debts.form.frequency")}>
                <SearchableSelect
                  id="debt-frequency"
                  variant="inline"
                  className="w-auto"
                  value={value.frequency}
                  onChange={(frequency) =>
                    onChange({ frequency: frequency as installments.InstallmentFrequency })
                  }
                  options={FREQS.map((f) => ({ value: f, label: t(`common.frequency.${f}`) }))}
                  searchPlaceholder={t("common.search")}
                  noResultsLabel={t("common.noResults")}
                  aria-label={t("debts.form.frequency")}
                />
              </DetailRow>
              <DetailRow label={t("debts.form.frequencyInterval")}>
                <span className="flex items-center gap-2">
                  <NumberField
                    min={1}
                    max={999}
                    value={String(value.frequencyInterval)}
                    onChange={(interval) =>
                      onChange({
                        frequencyInterval: Math.max(1, Number.parseInt(interval, 10) || 1),
                      })
                    }
                    aria-label={t("debts.form.frequencyInterval")}
                  />
                  <span className="text-sm text-muted-foreground">
                    {t(`debts.form.intervalUnit.${value.frequency}`, {
                      count: value.frequencyInterval,
                    })}
                  </span>
                </span>
              </DetailRow>
            </>
          ) : null}
        </div>

        <div className="flex gap-2 rounded-[9.6px] border bg-background p-[14px_16px]">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-[13px] text-muted-foreground">
            {hasInstallments
              ? t("debts.form.scheduleNoteMulti")
              : t("debts.form.scheduleNoteSingle")}
          </p>
        </div>
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
