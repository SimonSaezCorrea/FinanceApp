import type { accounts as accountsContract, installments } from "@finance/contracts";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { cardMetaLine } from "../../accounts/lib/accountMeta";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import {
  FormBigTextField,
  FormCounterField,
  FormCycleField,
  FormDateField,
  FormSelectField,
  FormTextareaField,
} from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";
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

  // A card already belongs to exactly one account, which already has its own
  // type/institution — asking for a SEPARATE "cuenta de pago" on top invited
  // the two to disagree (a card from one account, a payment account from
  // another). One field instead: picking a card derives its payment account
  // automatically (FR-037: a CREDIT card pays no instalment with money, so it
  // derives to none — the API would refuse the pair outright, INV-P2).
  const cardOptions = useMemo(
    () =>
      accounts.flatMap((account) =>
        account.cards.map((card) => ({
          id: card.id,
          accountId: account.id,
          kind: card.kind,
          label: card.name,
          description: cardMetaLine(account, card, (type) => t(`accounts.type.${type}`)),
        })),
      ),
    [accounts, t],
  );
  const selectedCard = cardOptions.find((c) => c.id === value.cardId) ?? null;
  const paymentCardValue = value.cardId ? `card:${value.cardId}` : "";

  function selectPaymentCard(optionValue: string) {
    if (!optionValue) {
      onChange({ cardId: "", paymentAccountId: "" });
      return;
    }
    const card = cardOptions.find((c) => `card:${c.id}` === optionValue);
    if (!card) return;
    onChange({
      cardId: card.id,
      paymentAccountId: card.kind === "CREDIT" ? "" : card.accountId,
    });
  }

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
        <FormBigTextField
          id="plan-title"
          value={value.title}
          onChange={(title) => onChange({ title })}
          placeholder={t("installments.form.title")}
          aria-label={t("installments.form.title")}
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
              <FormCounterField
                id="plan-count"
                label={t("installments.form.installmentCount")}
                min={1}
                max={600}
                value={String(value.installmentCount)}
                onChange={(count) =>
                  onChange({ installmentCount: Math.max(1, Number.parseInt(count, 10) || 1) })
                }
              />

              <FormDateField
                id="plan-start"
                label={t("installments.form.startDate")}
                value={value.startDate}
                onChange={(startDate) => onChange({ startDate })}
              />
            </div>
          </>
        ) : (
          <ImmutableFieldsNotice
            totalPrincipal={value.totalPrincipal}
            currency={value.currency}
            installmentCount={value.installmentCount}
            startDate={value.startDate}
            cardLabel={
              cardFrozen
                ? selectedCard
                  ? `${selectedCard.label} · ${selectedCard.description}`
                  : t("installments.form.cardNone")
                : null
            }
          />
        )}

        <div className="flex flex-col">
          <FormCycleField
            label={t("installments.form.frequency")}
            options={FREQUENCIES}
            value={value.frequency}
            onChange={(frequency) => onChange({ frequency })}
            renderValue={(f) => t(`common.frequency.${f}`)}
          />

          {/* What the frequency is multiplied by: 1 = every month, 2 = every other
              month. The unit is spelled out because "Cada 2" alone means nothing. */}
          <FormCounterField
            id="plan-interval"
            label={t("installments.form.frequencyInterval")}
            min={1}
            max={999}
            value={String(value.frequencyInterval)}
            onChange={(interval) =>
              onChange({ frequencyInterval: Math.max(1, Number.parseInt(interval, 10) || 1) })
            }
            unit={t(`installments.form.intervalUnit.${value.frequency}`, {
              count: value.frequencyInterval,
            })}
          />

          {/* FR-051: the movements' own repertoire — the same categories, so the
              same icon shows up in both views. Picked from a list, same as
              Recurrentes' own category field: typing lives in the panel's own
              search box, not in the closed control. */}
          <FormSelectField
            id="plan-category"
            label={t("installments.form.category")}
            value={value.category}
            onChange={(category) => onChange({ category })}
            options={[
              { value: "", label: t("recurring.form.noCategory") },
              ...categoryOptions.map((c) => ({
                value: c,
                label: c,
                icon: (
                  <CategoryIcon category={c} className="h-4 w-4 shrink-0 text-muted-foreground" />
                ),
              })),
            ]}
          />

          {/* FR-006b: once billed, shown (with its reason) inside
              `ImmutableFieldsNotice` above instead of as an editable field.
              One field, not two: a card already belongs to one specific
              account, so picking a payment account SEPARATELY could name a
              different one than the card actually draws from — this derives
              it instead of asking twice. */}
          {!cardFrozen && (
            <FormSelectField
              id="plan-card"
              label={t("installments.form.card")}
              value={paymentCardValue}
              onChange={selectPaymentCard}
              options={[
                { value: "", label: t("installments.form.cardNone") },
                ...cardOptions.map((c) => ({
                  value: `card:${c.id}`,
                  label: c.label,
                  description: c.description,
                })),
              ]}
            />
          )}

          {creating && (
            /* FR-044: interest is declared, never guessed. Left empty it is zero and
               the preview shows the plain principal. */
            <FormCounterField
              id="plan-apr"
              label={t("installments.form.aprPerPeriod")}
              min={0}
              // A rate per period is a fraction (0.02 = 2%), so it steps in
              // hundredths and accepts four decimals typed by hand.
              step={0.01}
              decimals={4}
              placeholder="0"
              value={value.aprPerPeriod}
              onChange={(aprPerPeriod) => onChange({ aprPerPeriod })}
            />
          )}
        </div>

        <FormTextareaField
          id="plan-notes"
          label={t("installments.form.notes")}
          value={value.notes}
          onChange={(notes) => onChange({ notes })}
          placeholder={t("installments.form.notesEmpty")}
        />

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
