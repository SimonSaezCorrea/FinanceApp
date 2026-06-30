import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";

const TYPES: accounts.AccountType[] = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CASH",
  "OTHER",
];
const STATUSES: accounts.AccountStatus[] = ["ACTIVE", "INACTIVE"];

export interface AccountFormValues {
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  institution: string;
  currency: string;
  initialBalance: string;
}

const EMPTY: AccountFormValues = {
  name: "",
  type: "CHECKING",
  status: "ACTIVE",
  institution: "",
  currency: "USD",
  initialBalance: "0",
};

interface Props {
  initial?: Partial<AccountFormValues>;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: AccountFormValues) => void;
}

export function AccountForm({ initial, submitting, submitLabel, onSubmit }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AccountFormValues>({ ...EMPTY, ...initial });

  const set = <K extends keyof AccountFormValues>(k: K, v: AccountFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(values);
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
        <Select
          id="acc-type"
          value={values.type}
          onChange={(e) => set("type", e.target.value as accounts.AccountType)}
          options={TYPES.map((v) => ({ value: v, label: t(`accounts.type.${v}`) }))}
        />
      </Field>
      <Field label={t("accounts.form.status")} htmlFor="acc-status">
        <Select
          id="acc-status"
          value={values.status}
          onChange={(e) => set("status", e.target.value as accounts.AccountStatus)}
          options={STATUSES.map((v) => ({ value: v, label: t(`accounts.status.${v}`) }))}
        />
      </Field>
      <Field label={t("accounts.form.institution")} htmlFor="acc-inst">
        <Input
          id="acc-inst"
          value={values.institution}
          onChange={(e) => set("institution", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("accounts.form.currency")} htmlFor="acc-cur">
          <Input
            id="acc-cur"
            value={values.currency}
            maxLength={3}
            required
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </Field>
        <Field label={t("accounts.form.initialBalance")} htmlFor="acc-bal">
          <Input
            id="acc-bal"
            value={values.initialBalance}
            inputMode="decimal"
            onChange={(e) => set("initialBalance", e.target.value)}
          />
        </Field>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
