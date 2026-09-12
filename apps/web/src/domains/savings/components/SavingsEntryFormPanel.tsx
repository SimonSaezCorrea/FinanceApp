import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, savings } from "@finance/contracts";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import {
  FormDateField,
  FormSelectField,
  FormTextareaField,
  FormTextField,
} from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";

export interface SavingsEntryFormValue {
  amount: string;
  savingsGoalId: string;
  title: string;
  contributedAt: string;
  bankAccountId: string;
  note: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  value: SavingsEntryFormValue;
  onChange: (patch: Partial<SavingsEntryFormValue>) => void;
  openGoals: savings.SavingsGoal[];
  accounts: accountsContract.BankAccount[];
  onSubmit: () => void;
  submitting?: boolean;
  dirty?: boolean;
}

/**
 * Registrar/editar aporte — README §4. Sin `surface="modal"`: es un panel
 * lateral que se apila SOBRE el de detalle, no lo reemplaza. La meta de
 * destino ya la decide el botón que abrió el panel (una meta, "aporte libre",
 * o el propio aporte que se está editando) — no hay selector de destino
 * aquí, sería redundante con lo que el título ya dice.
 */
export function SavingsEntryFormPanel({
  open,
  onOpenChange,
  mode,
  value,
  onChange,
  openGoals,
  accounts,
  onSubmit,
  submitting = false,
  dirty = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();
  const creating = mode === "create";
  const selectedGoal = openGoals.find((g) => g.id === value.savingsGoalId) ?? null;
  const selectedAccount = accounts.find((a) => a.id === value.bankAccountId) ?? null;
  // The account actually decides the real currency (it's what the backend
  // validates against) — the goal's own currency is only a hint before an
  // account is chosen. Ahorro libre has no currency of its own, so it follows
  // whichever account the user picks (it can differ aporte to aporte).
  const currency = selectedAccount?.currency ?? selectedGoal?.currency ?? "CLP";

  // A goal locks a currency (the backend rejects a mismatch) — ahorro libre
  // has none of its own, so any currency's account is fair game there.
  const accountOptions = accounts
    .filter((a) => a.type !== "CREDIT_CARD")
    .filter((a) => !selectedGoal || a.currency === selectedGoal.currency)
    .map((a) => ({
      value: a.id,
      label: a.name,
      description: accountMetaLine(a, (type) => t(`accounts.type.${type}`)),
    }));

  // Ahorro libre has nothing else to name it by — a goal-linked aporte can
  // fall back on the goal's own title (server-side rule mirrors this).
  const titleRequired = !selectedGoal;
  const canSubmit =
    value.amount.trim().length > 0 &&
    value.bankAccountId.trim().length > 0 &&
    (!titleRequired || value.title.trim().length > 0);

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      surface="panel"
      eyebrow={creating ? t("savings.entry.eyebrow") : t("savings.entry.editEyebrow")}
      title={
        <span className="text-[28px] font-semibold tracking-tight">
          {selectedGoal
            ? t("savings.entry.titleWithGoal", { goal: selectedGoal.title })
            : t("savings.entry.titleFree")}
        </span>
      }
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      dirty={dirty}
      submitLabel={creating ? t("savings.entry.submit") : undefined}
      onSubmit={onSubmit}
      className="z-[1500]"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline gap-2 border-b border-border pb-3">
          <span className="shrink-0 text-2xl font-bold text-accent" aria-hidden>
            {resolveCurrencySymbol(currency, currencies, i18n.language)}
          </span>
          <input
            inputMode="numeric"
            value={formatAmountDisplay(value.amount, groupingLocaleFor(currency, i18n.language))}
            onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
            placeholder="0"
            aria-label={t("savings.entry.eyebrow")}
            className="min-w-0 max-w-[240px] flex-1 border-0 bg-transparent p-0 text-[32px] font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none"
          />
          {/* Not a picker: ahorro libre has no currency of its own — this
              follows whichever source account is chosen below (FormSelectField
              "Cuenta"), so it's read-only here, just the code as confirmation. */}
          <span className="ml-auto shrink-0 text-sm text-muted-foreground">{currency}</span>
        </div>

        <div className="flex flex-col">
          <FormTextField
            id="savings-entry-title"
            label={
              titleRequired
                ? t("savings.entry.titleFieldLabel")
                : t("savings.entry.titleFieldLabelOptional")
            }
            value={value.title}
            onChange={(title) => onChange({ title })}
            placeholder={t("savings.entry.titleFieldPlaceholder")}
            showEditIcon
          />
          <FormDateField
            label={t("savings.entry.dateLabel")}
            value={value.contributedAt}
            onChange={(contributedAt) => onChange({ contributedAt })}
          />
          <FormSelectField
            id="savings-entry-account"
            label={t("savings.entry.accountLabel")}
            value={value.bankAccountId}
            onChange={(bankAccountId) => onChange({ bankAccountId })}
            options={accountOptions}
            placeholder={t("savings.entry.accountPlaceholder")}
          />
          <FormTextareaField
            id="savings-entry-note"
            label={t("savings.entry.noteLabel")}
            value={value.note}
            onChange={(note) => onChange({ note })}
            placeholder={t("savings.entry.notePlaceholder")}
            className="flex flex-col gap-1.5 pt-3"
            showEditIcon
          />
        </div>

        <p className="text-[13px] leading-[1.5] text-muted-foreground">
          {t(selectedGoal ? "savings.entry.noteWithGoal" : "savings.entry.noteWithoutGoal")}
        </p>
      </div>
    </FormSurface>
  );
}

export function emptySavingsEntryForm(today: string, savingsGoalId = ""): SavingsEntryFormValue {
  return {
    amount: "",
    savingsGoalId,
    title: "",
    contributedAt: today,
    bankAccountId: "",
    note: "",
  };
}

/** The form as it opens on an existing aporte. */
export function entryFormFrom(e: savings.SavingsEntry): SavingsEntryFormValue {
  return {
    amount: e.amount,
    savingsGoalId: e.savingsGoalId ?? "",
    title: e.title ?? "",
    contributedAt: e.contributedAt.slice(0, 10),
    bankAccountId: e.bankAccountId ?? "",
    note: e.note ?? "",
  };
}
