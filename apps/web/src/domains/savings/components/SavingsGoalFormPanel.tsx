import { Shuffle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";

import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { currencyPickerLabel } from "../../../shared/lib/currencyLabel";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { FormDateField, FormNotice, FormTextareaField } from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { colorForToken, GOAL_COLOR_TOKENS } from "../lib/goalVisual";

export interface SavingsGoalFormValue {
  title: string;
  targetAmount: string;
  currency: string;
  /** `""` = sin fecha límite — no separate on/off switch, the date itself
   * carries that meaning. */
  deadline: string;
  notes: string;
  /** `null` = Automático (el hash determinístico de `goalVisual.ts` decide). */
  color: savings.SavingsGoalColor | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  value: SavingsGoalFormValue;
  onChange: (patch: Partial<SavingsGoalFormValue>) => void;
  /** Locks the currency field once the goal has any real aporte (backend
   * rejects the change anyway — `SAVINGS_GOAL_CURRENCY_LOCKED`). */
  currencyLocked?: boolean;
  onSubmit: () => void;
  submitting?: boolean;
  dirty?: boolean;
}

/**
 * Nueva/Editar meta — mismo "form como hoja" que `RecurringFormPanel`/
 * `DebtFormPanel`: título grande, monto grande (símbolo + moneda seleccionable
 * en la misma fila, como `TransactionFormPanel`), luego filas con `border-t`.
 * `pace`/identidad visual no se piden aquí a propósito (research.md §4/§8):
 * se derivan, nunca se declaran.
 */
export function SavingsGoalFormPanel({
  open,
  onOpenChange,
  mode,
  value,
  onChange,
  currencyLocked = false,
  onSubmit,
  submitting = false,
  dirty = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();
  const creating = mode === "create";
  const locale = groupingLocaleFor(value.currency, i18n.language);

  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: currencyPickerLabel(c.code),
  }));
  if (currencies && !currencies.some((c) => c.code === value.currency)) {
    currencyOptions.unshift({ value: value.currency, label: currencyPickerLabel(value.currency) });
  }

  const canSubmit = value.title.trim().length > 0 && value.targetAmount.trim().length > 0;

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      surface="panel"
      eyebrow={creating ? t("savings.form.newEyebrow") : t("savings.form.editEyebrow")}
      title={
        <span className="sr-only">{creating ? t("savings.form.newEyebrow") : value.title}</span>
      }
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      dirty={dirty}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-5">
        <input
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t("savings.form.titlePlaceholder")}
          aria-label={t("savings.form.titlePlaceholder")}
          className="w-full border-0 bg-transparent p-0 text-[28px] font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 border-b border-border pb-3">
            <span className="shrink-0 text-[28px] font-semibold text-accent" aria-hidden>
              {resolveCurrencySymbol(value.currency, currencies, i18n.language)}
            </span>
            <input
              inputMode="numeric"
              value={formatAmountDisplay(value.targetAmount, locale)}
              onChange={(e) => onChange({ targetAmount: e.target.value.replace(/\D/g, "") })}
              placeholder="0"
              aria-label={t("savings.form.targetLabel")}
              className={cn(
                "min-w-0 max-w-[220px] flex-1 border-0 bg-transparent p-0 text-[32px] font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none",
              )}
            />
            <SearchableSelect
              id="savings-goal-currency"
              variant="inline"
              className="ml-auto w-auto shrink-0"
              value={value.currency}
              onChange={(currency) => onChange({ currency })}
              options={currencyOptions}
              displayValue={value.currency}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              disabled={currencyLocked}
              aria-label={t("savings.form.currencyLabel")}
            />
          </div>
          <span className="pt-1 text-xs text-muted-foreground">
            {t("savings.form.targetLabel")}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">{t("savings.form.colorLabel")}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ color: null })}
              aria-label={t("savings.form.colorAuto")}
              aria-pressed={value.color === null}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border-2 bg-chip",
                value.color === null ? "border-foreground" : "border-transparent",
              )}
            >
              <Shuffle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </button>
            {GOAL_COLOR_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => onChange({ color: token })}
                aria-label={t(`savings.form.colorNames.${token}`)}
                aria-pressed={value.color === token}
                style={{ backgroundColor: colorForToken(token) }}
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  value.color === token ? "border-foreground" : "border-transparent",
                )}
              />
            ))}
          </div>
        </div>

        <FormDateField
          label={t("savings.form.deadlineLabel")}
          value={value.deadline}
          onChange={(deadline) => onChange({ deadline })}
          clearable
        />

        <FormNotice>
          {t(value.deadline ? "savings.form.noteWithDeadline" : "savings.form.noteWithoutDeadline")}
        </FormNotice>

        <FormTextareaField
          label={t("savings.form.notesLabel")}
          value={value.notes}
          onChange={(notes) => onChange({ notes })}
          placeholder={t("savings.form.notesPlaceholder")}
        />
      </div>
    </FormSurface>
  );
}

export function emptySavingsGoalForm(currency = "CLP"): SavingsGoalFormValue {
  return { title: "", targetAmount: "", currency, deadline: "", notes: "", color: null };
}

export function savingsGoalFormFrom(g: savings.SavingsGoal): SavingsGoalFormValue {
  return {
    title: g.title,
    targetAmount: g.targetAmount,
    currency: g.currency,
    deadline: g.deadline ? g.deadline.slice(0, 10) : "",
    notes: g.notes ?? "",
    color: g.color,
  };
}
