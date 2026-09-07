import { ArrowRightLeft, Banknote, PiggyBank } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { cn } from "../../../shared/lib/cn";
import { FormDateField, FormSelectField } from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";

export type CloseDestination = "WITHDRAW_TO_ACCOUNT" | "FREE_SAVINGS" | "TRANSFER_TO_GOAL";

export interface SavingsGoalCloseValue {
  destination: CloseDestination;
  accountId: string;
  targetGoalId: string;
  closedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: savings.SavingsGoal;
  complete: boolean;
  value: SavingsGoalCloseValue;
  onChange: (patch: Partial<SavingsGoalCloseValue>) => void;
  accounts: accountsContract.BankAccount[];
  otherOpenGoals: savings.SavingsGoal[];
  onSubmit: () => void;
  submitting?: boolean;
}

/** Cerrar meta con destino — README §5. */
export function SavingsGoalClosePanel({
  open,
  onOpenChange,
  goal,
  complete,
  value,
  onChange,
  accounts,
  otherOpenGoals,
  onSubmit,
  submitting = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: goal.currency });

  const accountOptions = accounts
    .filter((a) => a.currency === goal.currency && a.type !== "CREDIT_CARD")
    .map((a) => ({
      value: a.id,
      label: a.name,
      description: accountMetaLine(a, (type) => t(`accounts.type.${type}`)),
    }));
  const targetGoalOptions = otherOpenGoals
    .filter((g) => g.currency === goal.currency)
    .map((g) => ({ value: g.id, label: g.title }));

  const canSubmit =
    (value.destination === "WITHDRAW_TO_ACCOUNT" && value.accountId.trim().length > 0) ||
    (value.destination === "TRANSFER_TO_GOAL" && value.targetGoalId.trim().length > 0) ||
    value.destination === "FREE_SAVINGS";

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t(complete ? "savings.close.eyebrowComplete" : "savings.close.eyebrowIncomplete")}
      title={
        <span className="text-[26px] font-semibold">
          {t("savings.close.title", { goal: goal.title })}
        </span>
      }
      description={t(
        complete ? "savings.close.summaryComplete" : "savings.close.summaryIncomplete",
      )}
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      submitLabel={t("savings.close.submit")}
      onSubmit={onSubmit}
      className="z-[1500]"
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-[9.6px] border border-border p-[14px_16px]">
          <span className="block text-xs text-muted-foreground">
            {t("savings.close.accumulatedLabel")}
          </span>
          <span className="text-[22px] font-semibold tabular-nums text-foreground">
            {money(goal.savedAmount)}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("savings.close.destinationLabel")}
          </h3>
          <DestinationCard
            active={value.destination === "WITHDRAW_TO_ACCOUNT"}
            icon={<Banknote className="h-4 w-4" aria-hidden />}
            label={t("savings.close.withdraw")}
            hint={t("savings.close.withdrawHint")}
            onClick={() => onChange({ destination: "WITHDRAW_TO_ACCOUNT" })}
          />
          <DestinationCard
            active={value.destination === "FREE_SAVINGS"}
            icon={<PiggyBank className="h-4 w-4" aria-hidden />}
            label={t("savings.close.free")}
            hint={t("savings.close.freeHint")}
            onClick={() => onChange({ destination: "FREE_SAVINGS" })}
          />
          {targetGoalOptions.length > 0 ? (
            <DestinationCard
              active={value.destination === "TRANSFER_TO_GOAL"}
              icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}
              label={t("savings.close.transfer")}
              hint={t("savings.close.transferHint")}
              onClick={() => onChange({ destination: "TRANSFER_TO_GOAL" })}
            />
          ) : null}
        </div>

        {value.destination === "WITHDRAW_TO_ACCOUNT" ? (
          <FormSelectField
            id="close-account"
            label={t("debts.form.account")}
            value={value.accountId}
            onChange={(accountId) => onChange({ accountId })}
            options={accountOptions}
            placeholder={t("savings.entry.accountPlaceholder")}
          />
        ) : null}
        {value.destination === "TRANSFER_TO_GOAL" ? (
          <FormSelectField
            id="close-target-goal"
            label={t("savings.close.targetGoalLabel")}
            value={value.targetGoalId}
            onChange={(targetGoalId) => onChange({ targetGoalId })}
            options={targetGoalOptions}
            placeholder={t("savings.close.targetGoalPlaceholder")}
          />
        ) : null}

        <FormDateField
          label={t("savings.close.dateLabel")}
          value={value.closedAt}
          onChange={(closedAt) => onChange({ closedAt })}
        />

        <p className="text-[13px] leading-[1.5] text-muted-foreground">{t("savings.close.note")}</p>
      </div>
    </FormSurface>
  );
}

function DestinationCard({
  active,
  icon,
  label,
  hint,
  onClick,
}: Readonly<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-[9.6px] border p-[12px_14px] text-left transition-colors",
        active ? "border-accent bg-chip" : "border-border",
      )}
    >
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium text-foreground">{label}</span>
        <span className="text-[13px] leading-[1.45] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

export function defaultCloseValue(complete: boolean, today: string): SavingsGoalCloseValue {
  return {
    destination: complete ? "WITHDRAW_TO_ACCOUNT" : "FREE_SAVINGS",
    accountId: "",
    targetGoalId: "",
    closedAt: today,
  };
}
