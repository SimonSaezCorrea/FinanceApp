import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, savings } from "@finance/contracts";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import {
  FormDateField,
  FormSelectField,
  FormTextareaField,
  FormTextField,
} from "../../../shared/ui/form";
import { FormChip, type FormChipOption } from "../../../shared/ui/form/FormChip";
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
  value: SavingsEntryFormValue;
  onChange: (patch: Partial<SavingsEntryFormValue>) => void;
  openGoals: savings.SavingsGoal[];
  accounts: accountsContract.BankAccount[];
  onSubmit: () => void;
  submitting?: boolean;
}

const FREE_SAVINGS = "";

/** Registrar aporte — README §4. Sin `surface="modal"`: es un panel lateral
 * que se apila SOBRE el de detalle, no lo reemplaza. */
export function SavingsEntryFormPanel({
  open,
  onOpenChange,
  value,
  onChange,
  openGoals,
  accounts,
  onSubmit,
  submitting = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const selectedGoal = openGoals.find((g) => g.id === value.savingsGoalId) ?? null;
  const selectedAccount = accounts.find((a) => a.id === value.bankAccountId) ?? null;
  // The account actually decides the real currency (it's what the backend
  // validates against) — the goal's own currency is only a hint before an
  // account is chosen. Ahorro libre has no currency of its own, so it follows
  // whichever account the user picks (it can differ aporte to aporte).
  const currency = selectedAccount?.currency ?? selectedGoal?.currency ?? "CLP";

  const destinationOptions: FormChipOption<string>[] = [
    { value: FREE_SAVINGS, label: t("savings.entry.freeChip") },
    ...openGoals.map((g) => ({ value: g.id, label: g.title })),
  ];

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
      mode="create"
      surface="panel"
      eyebrow={t("savings.entry.eyebrow")}
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
      submitLabel={t("savings.entry.submit")}
      onSubmit={onSubmit}
      className="z-[1500]"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline gap-2 border-b border-border pb-3">
          <span className="text-[30px] font-semibold text-success" aria-hidden>
            +
          </span>
          <input
            inputMode="numeric"
            value={formatAmountDisplay(value.amount, groupingLocaleFor(currency, i18n.language))}
            onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
            placeholder="0"
            aria-label={t("savings.entry.eyebrow")}
            className="min-w-0 max-w-[240px] flex-1 border-0 bg-transparent p-0 text-[32px] font-semibold tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          <span className="ml-auto shrink-0 text-sm text-muted-foreground">{currency}</span>
        </div>

        <FormChip
          value={value.savingsGoalId}
          onChange={(savingsGoalId) => {
            const newGoal = openGoals.find((g) => g.id === savingsGoalId) ?? null;
            const accountStillValid =
              !newGoal || !selectedAccount || selectedAccount.currency === newGoal.currency;
            onChange({ savingsGoalId, ...(accountStillValid ? {} : { bankAccountId: "" }) });
          }}
          options={destinationOptions}
          aria-label={t("savings.entry.eyebrow")}
        />

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
