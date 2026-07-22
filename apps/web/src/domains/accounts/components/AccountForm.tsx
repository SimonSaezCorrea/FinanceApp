import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";

import { useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Switch } from "../../../shared/ui/switch";
import { AccountTypeToggle } from "./AccountTypeToggle";

export interface AccountFormValues {
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  institutionId: string;
  accountNumber: string;
  currency: string;
  initialBalance: string;
  creditLimit: string;
  creditUsedInitial: string;
  /** "" = no cycle configured (all-time usage), else a "1"-"28" day-of-month string. */
  billingCycleDay: string;
}

const EMPTY: AccountFormValues = {
  name: "",
  type: "CHECKING",
  status: "ACTIVE",
  institutionId: "",
  accountNumber: "",
  currency: "CLP",
  initialBalance: "0",
  creditLimit: "0",
  creditUsedInitial: "0",
  billingCycleDay: "",
};

interface Props {
  initial?: Partial<AccountFormValues>;
  submitting?: boolean;
  submitLabel: string;
  /** Whether this account already has a CREDIT-kind card (added via CardsAside,
   * after account creation) — broadens the credit-pool fields the same way a
   * CREDIT_LINE account gets them, without hiding this account's own balance. */
  hasCreditCard?: boolean;
  onSubmit: (values: AccountFormValues) => void;
}

export function AccountForm({
  initial,
  submitting,
  submitLabel,
  hasCreditCard = false,
  onSubmit,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<AccountFormValues>({ ...EMPTY, ...initial });
  const isCreditLineType = values.type === "CREDIT_LINE";
  const { data: institutions } = useInstitutions(
    "CL",
    accountsContract.institutionKindForAccountType(values.type),
  );
  const { data: currencies } = useCurrencies();

  const set = <K extends keyof AccountFormValues>(k: K, v: AccountFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  const institutionOptions = [
    { value: "", label: t("accounts.form.institutionNone") },
    ...(institutions ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: `${c.name} (${c.code})`,
  }));
  // Ensure the current currency is selectable even before the list loads.
  if (values.currency && !currencyOptions.some((o) => o.value === values.currency)) {
    currencyOptions.unshift({ value: values.currency, label: values.currency });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Field label={t("accounts.form.name")}>
        <Input
          id="acc-name"
          value={values.name}
          required
          onChange={(e) => set("name", e.target.value)}
          aria-label={t("accounts.form.name")}
        />
      </Field>
      <Field label={t("accounts.form.type")}>
        <AccountTypeToggle
          value={values.type}
          onChange={(next) =>
            setValues((prev) => {
              if (next === "CASH") {
                return { ...prev, type: next, institutionId: "", accountNumber: "" };
              }
              const requiredKind = accountsContract.institutionKindForAccountType(next);
              const selected = institutions?.find((i) => i.id === prev.institutionId);
              const keepInstitution = !requiredKind || !selected || selected.kind === requiredKind;
              return {
                ...prev,
                type: next,
                ...(keepInstitution ? {} : { institutionId: "" }),
              };
            })
          }
        />
      </Field>
      {values.type !== "CASH" ? (
        <>
          <Field label={t("accounts.form.institution")}>
            <SearchableSelect
              id="acc-inst"
              value={values.institutionId}
              onChange={(v) => set("institutionId", v)}
              options={institutionOptions}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("accounts.form.institution")}
            />
          </Field>
          <Field label={t("accounts.form.accountNumber")}>
            <Input
              id="acc-num"
              value={values.accountNumber}
              inputMode="numeric"
              required={accountsContract.isAccountNumberRequired(values.type)}
              onChange={(e) => set("accountNumber", e.target.value)}
              aria-label={t("accounts.form.accountNumber")}
            />
          </Field>
        </>
      ) : null}
      <div className="grid grid-cols-[6rem_1fr] gap-4">
        <Field label={t("accounts.form.currency")}>
          <SearchableSelect
            id="acc-cur"
            value={values.currency}
            onChange={(v) => set("currency", v)}
            options={currencyOptions}
            displayValue={values.currency}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("accounts.form.currency")}
          />
        </Field>
        {isCreditLineType ? (
          <Field label={t("accounts.form.creditLimit")}>
            <Input
              id="acc-climit"
              value={formatAmountDisplay(values.creditLimit, groupingLocaleFor(values.currency, i18n.language))}
              inputMode="numeric"
              disabled={hasCreditCard}
              onChange={(e) => set("creditLimit", e.target.value.replace(/\D/g, ""))}
              aria-label={t("accounts.form.creditLimit")}
            />
          </Field>
        ) : (
          <Field label={t("accounts.form.initialBalance")}>
            <Input
              id="acc-bal"
              value={formatAmountDisplay(
                values.initialBalance,
                groupingLocaleFor(values.currency, i18n.language),
              )}
              inputMode="numeric"
              onChange={(e) => set("initialBalance", e.target.value.replace(/\D/g, ""))}
              aria-label={t("accounts.form.initialBalance")}
            />
          </Field>
        )}
      </div>
      {isCreditLineType && hasCreditCard ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("accounts.form.creditLimitMirroredHint")}
        </p>
      ) : null}
      {/* A checking/sight account that grew a CREDIT card also needs the account-level
          pool that card draws on — CREDIT_LINE already shows it above instead of a balance.
          Once a primary card exists, its limit IS this value — edit it from the card instead. */}
      {!isCreditLineType && hasCreditCard ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("accounts.form.creditLimit")}>
              <Input
                id="acc-climit2"
                value={formatAmountDisplay(
                  values.creditLimit,
                  groupingLocaleFor(values.currency, i18n.language),
                )}
                inputMode="numeric"
                disabled
                aria-label={t("accounts.form.creditLimit")}
              />
            </Field>
            <Field label={t("accounts.form.creditUsedInitial")}>
              <Input
                id="acc-cused2"
                value={formatAmountDisplay(
                  values.creditUsedInitial,
                  groupingLocaleFor(values.currency, i18n.language),
                )}
                inputMode="numeric"
                disabled
                aria-label={t("accounts.form.creditUsedInitial")}
              />
            </Field>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            {t("accounts.form.creditLimitMirroredHint")}
          </p>
        </div>
      ) : null}
      {isCreditLineType ? (
        <Field label={t("accounts.form.creditUsedInitial")}>
          <Input
            id="acc-cused"
            value={formatAmountDisplay(
              values.creditUsedInitial,
              groupingLocaleFor(values.currency, i18n.language),
            )}
            inputMode="numeric"
            disabled={hasCreditCard}
            aria-label={t("accounts.form.creditUsedInitial")}
            onChange={(e) => set("creditUsedInitial", e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      ) : null}
      {isCreditLineType || hasCreditCard ? (
        <>
          <Field label={t("accounts.form.billingCycleDay")}>
            <Input
              id="acc-billing-day"
              inputMode="numeric"
              placeholder={t("accounts.form.billingCycleDayPlaceholder")}
              value={values.billingCycleDay}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                set("billingCycleDay", digits && Number(digits) > 28 ? "28" : digits);
              }}
              aria-label={t("accounts.form.billingCycleDay")}
            />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("accounts.form.billingCycleDayHint")}
          </p>
        </>
      ) : null}
      <label className="flex items-center gap-2">
        <Switch
          checked={values.status === "ACTIVE"}
          onCheckedChange={(checked) => set("status", checked ? "ACTIVE" : "INACTIVE")}
          aria-label={t("accounts.form.accountActive")}
        />
        <span className="text-sm">{t("accounts.form.accountActive")}</span>
      </label>
      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
