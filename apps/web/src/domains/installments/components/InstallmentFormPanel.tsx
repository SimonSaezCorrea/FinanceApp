import type { accounts as accountsContract, installments } from "@finance/contracts";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { Combobox } from "../../../shared/ui/combobox";
import { DateField } from "../../../shared/ui/date-field";
import { DetailRow } from "../../../shared/ui/detail-row";
import { Input } from "../../../shared/ui/input";
import { NumberField } from "../../../shared/ui/number-field";
import { FormSurface } from "../../../shared/ui/overlay";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { schedulePreview } from "../lib/schedulePreview";
import { ImmutableFieldsNotice } from "./ImmutableFieldsNotice";
import { SchedulePreview } from "./SchedulePreview";

export interface InstallmentFormValue {
  title: string;
  totalPrincipal: string;
  currency: string;
  installmentCount: number;
  startDate: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  aprPerPeriod: string;
  category: string;
  cardId: string;
  paymentAccountId: string;
  notes: string;
}

const FREQUENCIES: installments.InstallmentFrequency[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  value: InstallmentFormValue;
  onChange: (patch: Partial<InstallmentFormValue>) => void;
  accounts: accountsContract.BankAccount[];
  categoryOptions: string[];
  /** Spec 014, FR-006b: the plan's card is frozen once it has billed an instalment
   * — always false while creating. */
  cardFrozen?: boolean;
  onSubmit: () => void;
  submitting?: boolean;
  dirty?: boolean;
  /** Rendered at the foot of the body — the delete action when editing. */
  footerExtras?: React.ReactNode;
}

/**
 * Creating and editing a plan: one panel, two modes.
 *
 * Creating shows the live preview (FR-040) — computed with the server's own schedule
 * function, so it is the schedule and not an estimate of it. Editing shows the three
 * fields it cannot change with their values and their reason (FR-048) instead of
 * quietly removing them, and offers the fields that CAN change without touching the
 * calendar or the payments already recorded (FR-049).
 */
export function InstallmentFormPanel({
  open,
  onOpenChange,
  mode,
  value,
  onChange,
  accounts,
  categoryOptions,
  cardFrozen = false,
  onSubmit,
  submitting = false,
  dirty = false,
  footerExtras,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const creating = mode === "create";

  const cards = useMemo(
    () =>
      accounts.flatMap((account) =>
        account.cards.map((card) => ({
          id: card.id,
          kind: card.kind,
          label: `${account.name} · ${card.name} ···· ${card.last4}`,
        })),
      ),
    [accounts],
  );
  const selectedCard = cards.find((c) => c.id === value.cardId) ?? null;
  // FR-037: a CREDIT-card plan pays no instalment with money, so there is no account
  // to remember. The API refuses the pair outright (INV-P2) — offering the field
  // would only produce an error.
  const offersPaymentAccount = selectedCard === null || selectedCard.kind !== "CREDIT";

  const preview = creating
    ? schedulePreview({
        totalPrincipal: value.totalPrincipal,
        installmentCount: value.installmentCount,
        startDate: value.startDate,
        frequency: value.frequency,
        frequencyInterval: value.frequencyInterval,
        aprPerPeriod: value.aprPerPeriod,
      })
    : null;

  const canSubmit =
    value.title.trim().length > 0 &&
    value.frequencyInterval >= 1 &&
    (!creating || preview !== null);

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      surface="panel"
      eyebrow={creating ? t("installments.form.eyebrowCreate") : t("installments.form.eyebrowEdit")}
      // The visible title is the plan's own title field, edited in the body — the
      // header carries only the eyebrow naming what this surface is. Printing both
      // would say "Nuevo plan" twice, one above the other.
      title={<span className="sr-only">{creating ? t("installments.new") : value.title}</span>}
      // The header's ✕ is already the way out; a Cancel button next to the primary
      // action would be a second one competing for the same corner.
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      dirty={dirty}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-5">
        {/* The title IS the plan's name in the list — the same editable-title shape
            the movement form uses. */}
        <input
          id="plan-title"
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t("installments.form.title")}
          aria-label={t("installments.form.title")}
          className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />

        {creating ? (
          <>
            <div className="flex items-baseline gap-3 border-b border-border pb-3">
              <input
                inputMode="numeric"
                data-testid="plan-total"
                value={formatAmountDisplay(
                  value.totalPrincipal,
                  groupingLocaleFor(value.currency, i18n.language),
                )}
                onChange={(e) => onChange({ totalPrincipal: e.target.value.replace(/\D/g, "") })}
                placeholder="0"
                aria-label={t("installments.form.totalPrincipal")}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-4xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <input
                value={value.currency}
                onChange={(e) => onChange({ currency: e.target.value.toUpperCase().slice(0, 3) })}
                aria-label={t("installments.form.currency")}
                className="w-12 shrink-0 border-0 bg-transparent p-0 text-right text-sm font-medium uppercase text-muted-foreground focus-visible:outline-none"
              />
            </div>

            <div className="flex flex-col">
              <DetailRow label={t("installments.form.installmentCount")}>
                <NumberField
                  id="plan-count"
                  min={1}
                  max={600}
                  value={String(value.installmentCount)}
                  onChange={(count) =>
                    onChange({ installmentCount: Math.max(1, Number.parseInt(count, 10) || 1) })
                  }
                  aria-label={t("installments.form.installmentCount")}
                />
              </DetailRow>

              <DetailRow label={t("installments.form.startDate")}>
                <DateField
                  id="plan-start"
                  variant="inline"
                  value={value.startDate}
                  onChange={(startDate) => onChange({ startDate })}
                  aria-label={t("installments.form.startDate")}
                />
              </DetailRow>
            </div>
          </>
        ) : (
          <ImmutableFieldsNotice
            totalPrincipal={value.totalPrincipal}
            currency={value.currency}
            installmentCount={value.installmentCount}
            startDate={value.startDate}
            cardLabel={cardFrozen ? (selectedCard?.label ?? t("installments.form.cardNone")) : null}
          />
        )}

        <div className="flex flex-col">
          <DetailRow label={t("installments.form.frequency")}>
            <SearchableSelect
              id="plan-frequency"
              variant="inline"
              className="w-auto"
              value={value.frequency}
              onChange={(frequency) =>
                onChange({ frequency: frequency as installments.InstallmentFrequency })
              }
              options={FREQUENCIES.map((f) => ({ value: f, label: t(`common.frequency.${f}`) }))}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("installments.form.frequency")}
            />
          </DetailRow>

          {/* What the frequency is multiplied by: 1 = every month, 2 = every other
              month. The unit is spelled out because "Cada 2" alone means nothing. */}
          <DetailRow label={t("installments.form.frequencyInterval")}>
            <span className="flex items-center gap-2">
              <NumberField
                id="plan-interval"
                min={1}
                max={999}
                value={String(value.frequencyInterval)}
                onChange={(interval) =>
                  onChange({ frequencyInterval: Math.max(1, Number.parseInt(interval, 10) || 1) })
                }
                aria-label={t("installments.form.frequencyInterval")}
              />
              <span className="text-sm text-muted-foreground">
                {t(`installments.form.intervalUnit.${value.frequency}`, {
                  count: value.frequencyInterval,
                })}
              </span>
            </span>
          </DetailRow>

          {/* FR-051: the movements' own repertoire, free text included — the same
              categories, so the same icon shows up in both views. */}
          <DetailRow label={t("installments.form.category")}>
            <Combobox
              id="plan-category"
              variant="inline"
              value={value.category}
              onChange={(category) => onChange({ category })}
              options={categoryOptions}
              placeholder={t("transactions.form.categoryEmpty")}
              aria-label={t("installments.form.category")}
              className="w-full max-w-[13rem]"
              // Only once a category is picked: the neutral tag icon standing next to
              // "Elegir categoría" reads as if something were already chosen.
              adornment={
                value.category ? (
                  <CategoryIcon category={value.category} className="h-4 w-4" />
                ) : undefined
              }
              renderOption={(option) => (
                <>
                  <CategoryIcon
                    category={option}
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 break-words">{option}</span>
                </>
              )}
            />
          </DetailRow>

          {/* FR-006b: once billed, shown (with its reason) inside
              `ImmutableFieldsNotice` above instead of as an editable field. */}
          {!cardFrozen && (
            <DetailRow label={t("installments.form.card")}>
              <SearchableSelect
                id="plan-card"
                variant="inline"
                className="w-auto"
                value={value.cardId}
                onChange={(cardId) =>
                  onChange({
                    cardId,
                    // Moving the plan onto a credit card drops the remembered account
                    // in the same gesture: the two cannot coexist.
                    ...(cards.find((c) => c.id === cardId)?.kind === "CREDIT"
                      ? { paymentAccountId: "" }
                      : {}),
                  })
                }
                options={[
                  { value: "", label: t("installments.form.cardNone") },
                  ...cards.map((c) => ({ value: c.id, label: c.label })),
                ]}
                searchPlaceholder={t("common.search")}
                noResultsLabel={t("common.noResults")}
                aria-label={t("installments.form.card")}
              />
            </DetailRow>
          )}

          {offersPaymentAccount ? (
            <DetailRow label={t("installments.form.paymentAccount")}>
              <SearchableSelect
                id="plan-account"
                variant="inline"
                className="w-auto"
                value={value.paymentAccountId}
                onChange={(paymentAccountId) => onChange({ paymentAccountId })}
                options={[
                  { value: "", label: t("installments.form.paymentAccountNone") },
                  ...accounts
                    .filter((a) => a.type !== "CREDIT_CARD")
                    .map((a) => ({ value: a.id, label: a.name })),
                ]}
                searchPlaceholder={t("common.search")}
                noResultsLabel={t("common.noResults")}
                aria-label={t("installments.form.paymentAccount")}
              />
            </DetailRow>
          ) : (
            <DetailRow
              label={t("installments.form.paymentAccount")}
              value={t("installments.form.paymentAccountCreditCard")}
            />
          )}

          {creating && (
            /* FR-044: interest is declared, never guessed. Left empty it is zero and
               the preview shows the plain principal. */
            <DetailRow label={t("installments.form.aprPerPeriod")}>
              <NumberField
                id="plan-apr"
                min={0}
                // A rate per period is a fraction (0.02 = 2%), so it steps in
                // hundredths and accepts four decimals typed by hand.
                step={0.01}
                decimals={4}
                value={value.aprPerPeriod}
                onChange={(aprPerPeriod) => onChange({ aprPerPeriod })}
                placeholder="0"
                aria-label={t("installments.form.aprPerPeriod")}
              />
            </DetailRow>
          )}

          <DetailRow label={t("installments.form.notes")}>
            <Input
              value={value.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder={t("installments.form.notesEmpty")}
              aria-label={t("installments.form.notes")}
              className="h-8 w-full max-w-[13rem] text-right"
            />
          </DetailRow>
        </div>

        {creating && (
          <SchedulePreview
            preview={preview}
            currency={value.currency}
            hasCard={value.cardId !== ""}
          />
        )}

        {footerExtras}
      </div>
    </FormSurface>
  );
}

/** A blank plan, dated today. */
export function emptyInstallmentForm(today: string): InstallmentFormValue {
  return {
    title: "",
    totalPrincipal: "",
    currency: "CLP",
    installmentCount: 12,
    startDate: today,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    aprPerPeriod: "",
    category: "",
    cardId: "",
    paymentAccountId: "",
    notes: "",
  };
}

/** The form as it opens on an existing plan. */
export function installmentFormFrom(plan: installments.InstallmentPlan): InstallmentFormValue {
  return {
    title: plan.title,
    totalPrincipal: plan.totalPrincipal,
    currency: plan.currency,
    installmentCount: plan.installmentCount,
    startDate: plan.startDate.slice(0, 10),
    frequency: plan.frequency,
    frequencyInterval: plan.frequencyInterval,
    aprPerPeriod: "",
    category: plan.category ?? "",
    cardId: plan.cardId ?? "",
    paymentAccountId: plan.paymentAccountId ?? "",
    notes: plan.notes ?? "",
  };
}
