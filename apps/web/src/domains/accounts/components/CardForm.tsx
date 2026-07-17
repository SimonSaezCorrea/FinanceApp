import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";

function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function cleanExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/** Parses "MM/AA" into a 1-12 month + 2000-based year, or null if not a valid expiry. */
function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{1,2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
}

interface Props {
  submitLabel: string;
  submitting?: boolean;
  initial?: accounts.Card;
  onSubmit: (card: accounts.CreateCard) => void;
}

/**
 * Collects a card (payment instrument). Only the last 4 digits are ever asked
 * for or stored — the full PAN never has a field to type into in the first
 * place. Credit limits live on the CREDIT_LINE account, not here.
 */
export function CardForm({ submitLabel, submitting, initial, onSubmit }: Readonly<Props>) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<accounts.CardKind>(initial?.kind ?? "CREDIT");
  const [last4, setLast4] = useState(initial?.last4 ?? "");
  const [expiry, setExpiry] = useState(
    initial ? formatExpiry(initial.expiryMonth, initial.expiryYear) : "",
  );
  const [last4Error, setLast4Error] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const validLast4 = /^\d{4}$/.test(last4);
    const parsedExpiry = parseExpiry(expiry);
    setLast4Error(validLast4 ? null : t("cards.errors.last4"));
    setExpiryError(parsedExpiry ? null : t("cards.errors.expiry"));
    if (!validLast4 || !parsedExpiry) return;

    onSubmit({
      name: name.trim() || t(`cards.kind.${kind}`),
      kind,
      last4,
      expiryMonth: parsedExpiry.month,
      expiryYear: parsedExpiry.year,
      isActive: initial?.isActive ?? true,
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field label={t("cards.form.name")} htmlFor="card-name">
        <Input
          id="card-name"
          value={name}
          placeholder={t("cards.form.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label={t("cards.form.expiry")} htmlFor="card-expiry" error={expiryError}>
          <Input
            id="card-expiry"
            inputMode="numeric"
            placeholder="MM/AA"
            value={expiry}
            onChange={(e) => setExpiry(cleanExpiryInput(e.target.value))}
          />
        </Field>
      </div>
      <Field label={t("cards.form.last4")} htmlFor="card-last4" error={last4Error}>
        <Input
          id="card-last4"
          inputMode="numeric"
          autoComplete="off"
          placeholder="4821"
          maxLength={4}
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </Field>
      <p className="-mt-1 text-xs text-muted-foreground">{t("cards.form.last4Hint")}</p>

      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
