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
import { useAccountMutations } from "../hooks/useAccounts";
import { CardForm } from "./CardForm";
import { CardPreview } from "./CardPreview";

const TYPES: accounts.AccountType[] = ["CHECKING", "SAVINGS", "VISTA"];

export function AccountCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { create } = useAccountMutations();
  const [name, setName] = useState("");
  const [type, setType] = useState<accounts.AccountType>("CHECKING");
  const [institution, setInstitution] = useState("");
  const [status, setStatus] = useState<accounts.AccountStatus>("ACTIVE");
  const [currency, setCurrency] = useState("USD");
  const [initialBalance, setInitialBalance] = useState("0");
  const [cards, setCards] = useState<accounts.CreateCard[]>([]);
  const [addingCard, setAddingCard] = useState(false);

  function reset() {
    setName("");
    setType("CHECKING");
    setInstitution("");
    setStatus("ACTIVE");
    setCurrency("USD");
    setInitialBalance("0");
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
        institution: institution || undefined,
        initialBalance: initialBalance || "0",
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
            <Input
              id="m-inst"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
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
              <Input
                id="m-cur"
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label={t("accounts.form.initialBalance")} htmlFor="m-bal">
              <Input
                id="m-bal"
                inputMode="decimal"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <CardPreview
            brand={institution || t("accounts.title")}
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
