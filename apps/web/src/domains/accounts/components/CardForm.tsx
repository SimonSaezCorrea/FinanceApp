import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { deriveLast4 } from "../api/cardsApi";

interface Props {
  submitLabel: string;
  submitting?: boolean;
  initial?: accounts.Card;
  onSubmit: (card: accounts.CreateCard) => void;
}

/**
 * Collects a card (payment instrument). The full number is only used locally to
 * derive last4 — never sent. Credit limits live on the CREDIT_LINE account, not here.
 */
export function CardForm({ submitLabel, submitting, initial, onSubmit }: Readonly<Props>) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<accounts.CardKind>(initial?.kind ?? "CREDIT");
  const [number, setNumber] = useState("");
  const [month, setMonth] = useState(String(initial?.expiryMonth ?? 1));
  const [year, setYear] = useState(String(initial?.expiryYear ?? new Date().getFullYear() + 3));
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    // On edit, keeping the number blank preserves the existing last4.
    const last4 = number.trim() ? deriveLast4(number) : (initial?.last4 ?? "");
    if (!/^\d{4}$/.test(last4)) {
      setError(t("cards.errors.last4"));
      return;
    }
    setError(null);
    onSubmit({
      name,
      kind,
      last4,
      expiryMonth: Number(month),
      expiryYear: Number(year),
      isActive: initial?.isActive ?? true,
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field label={t("cards.form.name")} htmlFor="card-name">
        <Input id="card-name" value={name} required onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("cards.form.kind")} htmlFor="card-kind">
        <Select
          id="card-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as accounts.CardKind)}
          options={[
            { value: "CREDIT", label: t("cards.kind.CREDIT") },
            { value: "DEBIT", label: t("cards.kind.DEBIT") },
            { value: "PREPAID", label: t("cards.kind.PREPAID") },
          ]}
        />
      </Field>
      <Field label={t("cards.form.number")} htmlFor="card-num" error={error}>
        <Input
          id="card-num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="•••• •••• •••• ••••"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </Field>
      <p className="-mt-1 text-xs text-muted-foreground">{t("cards.form.numberHint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("cards.form.expiryMonth")} htmlFor="card-mm">
          <Input
            id="card-mm"
            inputMode="numeric"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        <Field label={t("cards.form.expiryYear")} htmlFor="card-yy">
          <Input
            id="card-yy"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
