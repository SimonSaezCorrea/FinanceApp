import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, recurring } from "@finance/contracts";

import { accountMetaLine, cardMetaLine } from "../../accounts/lib/accountMeta";
import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import {
  FormBigTextField,
  FormCounterField,
  FormCycleField,
  FormDateField,
  FormNotice,
  FormSelectField,
  FormTextareaField,
} from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";
import { FREQUENCY_ORDER } from "../lib/recurringMetrics";

export interface RecurringFormValue {
  label: string;
  amount: string;
  currency: string;
  category: string;
  frequency: recurring.RecurrenceFrequency;
  interval: number;
  anchorDate: string;
  bankAccountId: string;
  /** The card this series is paid with, when it isn't a plain transfer out of
   * the account above — optional, purely informational. `""` = none. */
  cardId: string;
  active: boolean;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  value: RecurringFormValue;
  onChange: (patch: Partial<RecurringFormValue>) => void;
  accounts: accountsContract.BankAccount[];
  /** The same category vocabulary Movimientos offers (`GET /transactions/summary`'s
   * `categories`) — one shared list, not a second one this domain invents. */
  categoryOptions: string[];
  onSubmit: () => void;
  submitting?: boolean;
  dirty?: boolean;
}

/**
 * Create/edit sheet, same "fields as bordered rows" shape as `DebtFormPanel`
 * — built from the shared `shared/ui/form/*` field components so both stay
 * that way. Periodicity has no picker: a ‹ › stepper (`FormCycleField`)
 * cycles WEEKLY ↔ MONTHLY ↔ YEARLY (`FREQUENCY_ORDER`) in either direction —
 * a chevron-down would read as "opens a dropdown", which this isn't. DAILY is
 * skipped because the real `RecurrenceFrequency` contract has no such value,
 * only the design handoff's fixture data does.
 */
export function RecurringFormPanel({
  open,
  onOpenChange,
  mode,
  value,
  onChange,
  accounts,
  categoryOptions,
  onSubmit,
  submitting = false,
  dirty = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();
  const creating = mode === "create";

  const accountOptions = [
    { value: "", label: t("recurring.form.noAccount") },
    ...accounts.map((a) => ({
      value: a.id,
      label: a.name,
      description: accountMetaLine(a, (type) => t(`accounts.type.${type}`)),
    })),
  ];

  // The card field only makes sense once an account is chosen (a card always
  // belongs to one) and that account actually carries any — otherwise there's
  // nothing to offer. Paying straight from the account (a transfer) is the
  // default, same convention a movement's own card field uses — including its
  // "tipo · banco · número" description line (`cardMetaLine`), so a card reads
  // the same way here as it does in Movimientos.
  const typeLabel = (accType: accountsContract.AccountType) => t(`accounts.type.${accType}`);
  const selectedAccount = accounts.find((a) => a.id === value.bankAccountId);
  const cardOptions = [
    { value: "", label: t("transactions.form.ownAccount") },
    ...(selectedAccount?.cards ?? []).map((c) => ({
      value: c.id,
      label: c.name,
      description: selectedAccount ? cardMetaLine(selectedAccount, c, typeLabel) : undefined,
    })),
  ];

  // The same category vocabulary Movimientos offers, picked from a list —
  // typing lives inside the panel's own search box, not in the closed
  // control. `value.category` is folded in when it isn't already there (an
  // existing series edited before its category ever appeared in Movimientos),
  // same convention `DebtFormPanel`'s currency picker uses.
  const categoryIcon = (c: string) => (
    <CategoryIcon category={c} className="h-4 w-4 shrink-0 text-muted-foreground" />
  );
  const categoryPickerOptions = [
    { value: "", label: t("recurring.form.noCategory") },
    ...categoryOptions.map((c) => ({ value: c, label: c, icon: categoryIcon(c) })),
  ];
  if (value.category && !categoryOptions.includes(value.category)) {
    categoryPickerOptions.push({
      value: value.category,
      label: value.category,
      icon: categoryIcon(value.category),
    });
  }

  const unit = t(`debts.form.intervalUnit.${value.frequency}`, { count: value.interval });
  const noteText = value.active
    ? t("recurring.form.noteActive", { count: value.interval, unit })
    : t("recurring.form.notePaused");

  const canSubmit = value.label.trim().length > 0 && value.amount.trim().length > 0;

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      surface="panel"
      eyebrow={creating ? t("recurring.new") : t("recurring.edit")}
      title={<span className="sr-only">{creating ? t("recurring.new") : value.label}</span>}
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      dirty={dirty}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-5">
        <FormBigTextField
          size="3xl"
          value={value.label}
          onChange={(label) => onChange({ label })}
          placeholder={t("recurring.form.namePlaceholder")}
          aria-label={t("recurring.form.label")}
        />

        {/* A recurring series is always an outgoing expense — red like any
            other expense amount, never a neutral tone. */}
        <div className="flex items-baseline gap-2 border-b border-border pb-3">
          <span className="shrink-0 text-3xl font-bold text-destructive" aria-hidden>
            {resolveCurrencySymbol(value.currency, currencies, i18n.language)}
          </span>
          <input
            inputMode="numeric"
            value={formatAmountDisplay(value.amount, groupingLocaleFor(value.currency, i18n.language))}
            onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
            placeholder="0"
            aria-label={t("recurring.form.amount")}
            className="min-w-0 max-w-[220px] flex-1 border-0 bg-transparent p-0 text-3xl font-bold tabular-nums text-destructive placeholder:text-destructive/50 focus-visible:outline-none"
          />
          <span className="ml-auto shrink-0 text-sm text-muted-foreground">{value.currency}</span>
        </div>

        <div className="flex flex-col">
          <FormSelectField
            id="recurring-category"
            label={t("transactions.form.category")}
            value={value.category}
            onChange={(category) => onChange({ category })}
            options={categoryPickerOptions}
            placeholder={t("recurring.form.categoryPlaceholder")}
          />

          <FormCycleField
            label={t("recurring.form.frequency")}
            options={FREQUENCY_ORDER}
            value={value.frequency}
            onChange={(frequency) => onChange({ frequency })}
            renderValue={(f) => t(`common.frequency.${f}`)}
          />

          <FormCounterField
            label={t("recurring.form.interval")}
            min={1}
            max={366}
            value={String(value.interval)}
            onChange={(v) => onChange({ interval: Math.max(1, Number.parseInt(v, 10) || 1) })}
            unit={unit}
          />

          <FormDateField
            label={t("recurring.form.anchorDate")}
            value={value.anchorDate}
            onChange={(anchorDate) => onChange({ anchorDate })}
          />

          <FormSelectField
            id="recurring-account"
            label={t("debts.form.account")}
            value={value.bankAccountId}
            onChange={(bankAccountId) => onChange({ bankAccountId, cardId: "" })}
            options={accountOptions}
          />

          {selectedAccount && selectedAccount.cards.length > 0 ? (
            <FormSelectField
              id="recurring-card"
              label={t("transactions.form.card")}
              value={value.cardId}
              onChange={(cardId) => onChange({ cardId })}
              options={cardOptions}
            />
          ) : null}
        </div>

        <FormNotice>{noteText}</FormNotice>

        <FormTextareaField
          label={t("recurring.form.notes")}
          value={value.notes}
          onChange={(notes) => onChange({ notes })}
          placeholder={t("recurring.form.notesPlaceholder")}
        />
      </div>
    </FormSurface>
  );
}

/** A blank series, dated today, in the caller's preferred currency. */
export function emptyRecurringForm(today: string, currency = "CLP"): RecurringFormValue {
  return {
    label: "",
    amount: "",
    currency,
    category: "",
    frequency: "MONTHLY",
    interval: 1,
    anchorDate: today,
    bankAccountId: "",
    cardId: "",
    active: true,
    notes: "",
  };
}

/** The form as it opens on an existing series. */
export function recurringFormFrom(r: recurring.RecurringExpense): RecurringFormValue {
  return {
    label: r.label,
    amount: r.amount,
    currency: r.currency,
    category: r.category ?? "",
    frequency: r.frequency,
    interval: r.interval,
    anchorDate: r.anchorDate.slice(0, 10),
    bankAccountId: r.bankAccountId ?? "",
    cardId: r.cardId ?? "",
    active: r.active,
    notes: r.notes ?? "",
  };
}
