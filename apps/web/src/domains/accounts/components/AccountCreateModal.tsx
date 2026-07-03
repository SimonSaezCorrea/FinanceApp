import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Dialog } from "../../../shared/ui/dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { useAccountMutations } from "../hooks/useAccounts";
import { CardForm } from "./CardForm";
import { CardPreview } from "./CardPreview";

const TYPES: accounts.AccountType[] = [
  "CHECKING",
  "SIGHT",
  "SAVINGS",
  "INVESTMENT",
  "CREDIT_LINE",
  "CASH",
];

export function AccountCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { create } = useAccountMutations();
  const { data: institutions } = useInstitutions("CL");
  const { data: currencies } = useCurrencies();
  const [name, setName] = useState("");
  const [type, setType] = useState<accounts.AccountType>("CHECKING");
  const [institutionId, setInstitutionId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [status, setStatus] = useState<accounts.AccountStatus>("ACTIVE");
  const [currency, setCurrency] = useState("CLP");
  const [initialBalance, setInitialBalance] = useState("0");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditUsedInitial, setCreditUsedInitial] = useState("0");
  const [cards, setCards] = useState<accounts.CreateCard[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const isCredit = type === "CREDIT_LINE";

  function reset() {
    setName("");
    setType("CHECKING");
    setInstitutionId("");
    setAccountNumber("");
    setStatus("ACTIVE");
    setCurrency("CLP");
    setInitialBalance("0");
    setCreditLimit("0");
    setCreditUsedInitial("0");
    setCards([]);
    setAddingCard(false);
  }

  function submit() {
    create.mutate(
      {
        name,
        type,
        status,
        currency,
        institutionId: institutionId || undefined,
        accountNumber: accountNumber || undefined,
        initialBalance: isCredit ? "0" : initialBalance || "0",
        creditLimit: isCredit ? creditLimit || "0" : undefined,
        creditUsedInitial: isCredit ? creditUsedInitial || "0" : undefined,
        cards: cards.length > 0 ? cards : undefined,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  const institutionName = institutions?.find((b) => b.id === institutionId)?.name ?? "";
  const institutionOptions = [
    { value: "", label: t("accounts.form.institutionNone") },
    ...(institutions ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: `${c.code} · ${c.name}`,
  }));
  if (currency && !currencyOptions.some((o) => o.value === currency)) {
    currencyOptions.unshift({ value: currency, label: currency });
  }

  const balancePreview = (() => {
    try {
      return formatMoney(initialBalance || "0", { locale: i18n.language, currency });
    } catch {
      return initialBalance;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("accounts.new")}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label={t("accounts.form.name")} htmlFor="m-name">
            <Input id="m-name" value={name} required onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("accounts.form.type")} htmlFor="m-type">
            <Select
              id="m-type"
              value={type}
              onChange={(e) => setType(e.target.value as accounts.AccountType)}
              options={TYPES.map((v) => ({ value: v, label: t(`accounts.type.${v}`) }))}
            />
          </Field>
          <Field label={t("accounts.form.institution")} htmlFor="m-inst">
            <Select
              id="m-inst"
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              options={institutionOptions}
            />
          </Field>
          <Field label={t("accounts.form.accountNumber")} htmlFor="m-num">
            <Input
              id="m-num"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </Field>
          <Field label={t("accounts.form.status")} htmlFor="m-status">
            <Select
              id="m-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as accounts.AccountStatus)}
              options={[
                { value: "ACTIVE", label: t("accounts.status.ACTIVE") },
                { value: "INACTIVE", label: t("accounts.status.INACTIVE") },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("accounts.form.currency")} htmlFor="m-cur">
              <Select
                id="m-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={currencyOptions}
              />
            </Field>
            {isCredit ? (
              <Field label={t("accounts.form.creditLimit")} htmlFor="m-climit">
                <Input
                  id="m-climit"
                  inputMode="decimal"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </Field>
            ) : (
              <Field label={t("accounts.form.initialBalance")} htmlFor="m-bal">
                <Input
                  id="m-bal"
                  inputMode="decimal"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                />
              </Field>
            )}
          </div>
          {isCredit ? (
            <Field label={t("accounts.form.creditUsedInitial")} htmlFor="m-cused">
              <Input
                id="m-cused"
                inputMode="decimal"
                value={creditUsedInitial}
                onChange={(e) => setCreditUsedInitial(e.target.value)}
              />
            </Field>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <CardPreview
            brand={institutionName || t("accounts.title")}
            title={name}
            subtitle={t(`accounts.type.${type}`)}
            primary={balancePreview}
            footerLeft={currency}
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("cards.title")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddingCard((v) => !v)}
              >
                {addingCard ? t("common.cancel") : t("cards.add")}
              </Button>
            </div>
            {cards.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  {c.name} <Badge variant="neutral">{t(`cards.kind.${c.kind}`)}</Badge>
                  <span className="text-muted-foreground">•••• {c.last4}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCards((p) => p.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
            ))}
            {addingCard ? (
              <CardForm
                submitLabel={t("cards.add")}
                onSubmit={(card) => {
                  setCards((p) => [...p, card]);
                  setAddingCard(false);
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={create.isPending || !name}>
          {t("accounts.new")}
        </Button>
      </div>
    </Dialog>
  );
}
