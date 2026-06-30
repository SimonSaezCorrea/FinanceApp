import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { deriveLast4 } from "../api/cardsApi";

interface LimitRow {
  currency: string;
  limit: string;
  used: string;
}

interface Props {
  submitLabel: string;
  submitting?: boolean;
  initial?: accounts.Card;
  onSubmit: (card: accounts.CreateCard) => void;
}

/** Collects a card. The full number is only used locally to derive last4 — never sent. */
export function CardForm({ submitLabel, submitting, initial, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<accounts.CardKind>(initial?.kind ?? "CREDIT");
  const [number, setNumber] = useState("");
  const [month, setMonth] = useState(String(initial?.expiryMonth ?? 1));
  const [year, setYear] = useState(String(initial?.expiryYear ?? new Date().getFullYear() + 3));
  const [limits, setLimits] = useState<LimitRow[]>(
    initial?.limits?.length
      ? initial.limits.map((l) => ({ currency: l.currency, limit: l.limit, used: l.used }))
      : [{ currency: "USD", limit: "0", used: "0" }],
  );
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
      limits: kind === "CREDIT" ? limits : undefined,
    });
  }

  return (
    <form className="flex flex-col gap-3 rounded-md border p-4" onSubmit={submit}>
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

      {kind === "CREDIT" ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("cards.form.limits")}</span>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
            <span>{t("cards.form.currency")}</span>
            <span>{t("cards.form.limit")}</span>
            <span>{t("cards.form.used")}</span>
            <span />
          </div>
          {limits.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              <Input
                aria-label={t("cards.form.currency")}
                placeholder={t("cards.form.currency")}
                value={l.currency}
                maxLength={3}
                onChange={(e) =>
                  updateLimit(setLimits, i, { currency: e.target.value.toUpperCase() })
                }
              />
              <Input
                aria-label={t("cards.form.limit")}
                placeholder={t("cards.form.limit")}
                inputMode="decimal"
                value={l.limit}
                onChange={(e) => updateLimit(setLimits, i, { limit: e.target.value })}
              />
              <Input
                aria-label={t("cards.form.used")}
                placeholder={t("cards.form.used")}
                inputMode="decimal"
                value={l.used}
                onChange={(e) => updateLimit(setLimits, i, { used: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("common.cancel")}
                onClick={() => setLimits((p) => p.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLimits((p) => [...p, { currency: "USD", limit: "0", used: "0" }])}
          >
            {t("cards.form.addLimit")}
          </Button>
        </div>
      ) : null}

      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}

function updateLimit(
  setLimits: React.Dispatch<React.SetStateAction<LimitRow[]>>,
  index: number,
  patch: Partial<LimitRow>,
) {
  setLimits((prev) => prev.map((l, j) => (j === index ? { ...l, ...patch } : l)));
}
