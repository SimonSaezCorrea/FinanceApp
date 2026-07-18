import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";

import { useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
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
};

interface Props {
  initial?: Partial<AccountFormValues>;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: AccountFormValues) => void;
}

export function AccountForm({ initial, submitting, submitLabel, onSubmit }: Readonly<Props>) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AccountFormValues>({ ...EMPTY, ...initial });
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
    label: `${c.code} · ${c.name}`,
  }));
  // Ensure the current currency is selectable even before the list loads.
  if (values.currency && !currencyOptions.some((o) => o.value === values.currency)) {
    currencyOptions.unshift({ value: values.currency, label: values.currency });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Field label={t("accounts.form.name")} htmlFor="acc-name">
        <Input
          id="acc-name"
          value={values.name}
          required
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label={t("accounts.form.type")} htmlFor="acc-type">
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
          <Field label={t("accounts.form.institution")} htmlFor="acc-inst">
            <Select
              id="acc-inst"
              value={values.institutionId}
              onChange={(e) => set("institutionId", e.target.value)}
              options={institutionOptions}
            />
          </Field>
          <Field label={t("accounts.form.accountNumber")} htmlFor="acc-num">
            <Input
              id="acc-num"
              value={values.accountNumber}
              inputMode="numeric"
              onChange={(e) => set("accountNumber", e.target.value)}
            />
          </Field>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("accounts.form.currency")} htmlFor="acc-cur">
          <Select
            id="acc-cur"
            value={values.currency}
            onChange={(e) => set("currency", e.target.value)}
            options={currencyOptions}
          />
        </Field>
        {values.type === "CREDIT_LINE" ? (
          <Field label={t("accounts.form.creditLimit")} htmlFor="acc-climit">
            <Input
              id="acc-climit"
              value={values.creditLimit}
              inputMode="decimal"
              onChange={(e) => set("creditLimit", e.target.value)}
            />
          </Field>
        ) : (
          <Field label={t("accounts.form.initialBalance")} htmlFor="acc-bal">
            <Input
              id="acc-bal"
              value={values.initialBalance}
              inputMode="decimal"
              onChange={(e) => set("initialBalance", e.target.value)}
            />
          </Field>
        )}
      </div>
      {values.type === "CREDIT_LINE" ? (
        <Field label={t("accounts.form.creditUsedInitial")} htmlFor="acc-cused">
          <Input
            id="acc-cused"
            value={values.creditUsedInitial}
            inputMode="decimal"
            onChange={(e) => set("creditUsedInitial", e.target.value)}
          />
        </Field>
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
