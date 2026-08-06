import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { recurring } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { Button } from "../../../shared/ui/button";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { useRecurringMutations } from "../hooks/useRecurring";

const FREQUENCIES: recurring.RecurrenceFrequency[] = ["WEEKLY", "MONTHLY", "YEARLY"];

function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RecurringFormModal({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: recurring.RecurringExpense;
}) {
  const { t } = useTranslation();
  const { create, update } = useRecurringMutations();
  const { data: accountList } = useAccounts();
  const editing = Boolean(initial);

  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "CLP");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [frequency, setFrequency] = useState<recurring.RecurrenceFrequency>(
    initial?.frequency ?? "MONTHLY",
  );
  const [interval, setIntervalValue] = useState(String(initial?.interval ?? 1));
  const [anchorDate, setAnchorDate] = useState(
    initial ? isoToDateInput(initial.anchorDate) : todayInput(),
  );
  const [bankAccountId, setBankAccountId] = useState(initial?.bankAccountId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit() {
    const body = {
      label,
      amount,
      currency,
      category: category || undefined,
      frequency,
      interval: Math.max(1, Number(interval) || 1),
      anchorDate: new Date(`${anchorDate}T00:00:00`).toISOString(),
      bankAccountId: bankAccountId || undefined,
      notes: notes || undefined,
    };
    const opts = {
      onSuccess: () => {
        toast.success(editing ? t("recurring.updated") : t("recurring.created"));
        onOpenChange(false);
      },
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    };
    if (editing && initial) update.mutate({ id: initial.id, body }, opts);
    else create.mutate(body, opts);
  }

  const accountOptions = [
    { value: "", label: t("transactions.form.noAccount") },
    ...(accountList ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];
  const pending = create.isPending || update.isPending;

  return (
    <ResponsiveSurface
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("recurring.edit") : t("recurring.new")}
      className="max-w-md"
    >
      <div className="flex flex-col gap-3">
        <Field label={t("recurring.form.label")}>
          <Input
            id="rec-label"
            value={label}
            required
            onChange={(e) => setLabel(e.target.value)}
            aria-label={t("recurring.form.label")}
          />
        </Field>

        <div className="grid grid-cols-[1fr_90px] gap-3">
          <Field label={t("recurring.form.amount")}>
            <Input
              id="rec-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              aria-label={t("recurring.form.amount")}
            />
          </Field>
          <Field label={t("accounts.form.currency")}>
            <Input
              id="rec-cur"
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              aria-label={t("accounts.form.currency")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("recurring.form.frequency")}>
            <Select
              id="rec-freq"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as recurring.RecurrenceFrequency)}
              options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))}
              aria-label={t("recurring.form.frequency")}
            />
          </Field>
          <Field label={t("recurring.form.interval")}>
            <Input
              id="rec-int"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setIntervalValue(e.target.value)}
              aria-label={t("recurring.form.interval")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("recurring.form.anchorDate")}>
            <Input
              id="rec-anchor"
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              aria-label={t("recurring.form.anchorDate")}
            />
          </Field>
          <Field label={t("transactions.form.category")}>
            <Input
              id="rec-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label={t("transactions.form.category")}
            />
          </Field>
        </div>

        <Field label={t("transactions.form.account")}>
          <Select
            id="rec-acc"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            options={accountOptions}
            aria-label={t("transactions.form.account")}
          />
        </Field>

        <Field label={t("recurring.form.notes")}>
          <Input
            id="rec-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label={t("recurring.form.notes")}
          />
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={pending || !label || !amount}>
          {editing ? t("accounts.actions.save") : t("recurring.new")}
        </Button>
      </div>
    </ResponsiveSurface>
  );
}
