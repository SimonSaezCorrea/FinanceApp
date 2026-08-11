import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { debts, installments } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Segmented } from "../../../shared/ui/segmented";
import { useDebtMutations } from "../hooks/useDebtMutations";

type Direction = debts.DebtDirection;
type Freq = installments.InstallmentFrequency;

const FREQS: Freq[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

interface DebtCreateModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialData?: debts.Debt;
}

export function DebtCreateModal({ open, onOpenChange, initialData }: DebtCreateModalProps) {
  const { t } = useTranslation();
  const { create, update } = useDebtMutations();
  const isEdit = initialData !== undefined;

  const [direction, setDirection] = useState<Direction>("YOU_OWE");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [openedAt, setOpenedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState("");
  const [totalInstallments, setTotalInstallments] = useState(1);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [frequency, setFrequency] = useState<Freq>("MONTHLY");
  const [frequencyInterval, setFrequencyInterval] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (initialData) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
        setDirection(initialData.direction);
        setCounterparty(initialData.counterparty);
        setAmount(initialData.principal);
        setCurrency(initialData.currency);
        setOpenedAt(initialData.openedAt.slice(0, 10));
        setDueAt(initialData.dueAt ? initialData.dueAt.slice(0, 10) : "");
        setTotalInstallments(initialData.totalInstallments);
        setInstallmentAmount(initialData.installmentAmount ?? "");
        setFrequency(initialData.frequency);
        setFrequencyInterval(initialData.frequencyInterval);
        setNotes(initialData.notes ?? "");
      }
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isValid =
    counterparty.trim().length > 0 && amount.trim().length > 0 && frequencyInterval >= 1;

  function reset() {
    setDirection("YOU_OWE");
    setCounterparty("");
    setAmount("");
    setCurrency("CLP");
    setOpenedAt(new Date().toISOString().slice(0, 10));
    setDueAt("");
    setTotalInstallments(1);
    setInstallmentAmount("");
    setFrequency("MONTHLY");
    setFrequencyInterval(1);
    setNotes("");
  }

  function handleSubmit() {
    if (!isValid) return;
    const body = {
      direction,
      counterparty: counterparty.trim(),
      principal: amount.trim(),
      currency: currency.trim().toUpperCase(),
      openedAt: new Date(openedAt).toISOString(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      totalInstallments,
      installmentAmount:
        totalInstallments > 1 && installmentAmount.trim() ? installmentAmount.trim() : undefined,
      frequency,
      frequencyInterval,
      notes: notes.trim() || undefined,
    };

    if (isEdit) {
      update.mutate(
        { id: initialData.id, body },
        {
          onSuccess: () => {
            toast.success(t("debts.updated"));
            onOpenChange(false);
          },
          onError: () => toast.error(t("errors.INTERNAL_ERROR")),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success(t("debts.created"));
          reset();
          onOpenChange(false);
        },
        onError: () => toast.error(t("errors.INTERNAL_ERROR")),
      });
    }
  }

  const isPending = isEdit ? update.isPending : create.isPending;
  const idleLabel = isEdit ? t("common.save") : t("debts.new");
  const submitLabel = isPending ? "…" : idleLabel;

  return (
    <ResponsiveSurface
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `${t("common.edit")}: ${initialData.counterparty}` : t("debts.new")}
    >
      <div className="flex flex-col gap-4">
        <Field label={t("debts.form.direction")}>
          <Segmented
            options={[
              { value: "YOU_OWE", label: t("debts.form.directionOptions.YOU_OWE") },
              { value: "OWED_TO_YOU", label: t("debts.form.directionOptions.OWED_TO_YOU") },
            ]}
            value={direction}
            onChange={(v) => setDirection(v as Direction)}
          />
        </Field>

        <Field label={t("debts.form.counterparty")}>
          <Input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="Nombre"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("debts.form.amount")}>
            <Input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label={t("debts.form.currency")}>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              placeholder="CLP"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("debts.form.openedAt")}>
            <Input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
          </Field>
          <Field label={t("debts.form.dueAt")}>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>

        <Field label={t("debts.form.installments")}>
          <Input
            type="number"
            min="1"
            step="1"
            value={totalInstallments}
            onChange={(e) =>
              setTotalInstallments(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
            }
          />
        </Field>

        {totalInstallments > 1 ? (
          <Field label={t("debts.form.installmentAmount")}>
            <Input
              type="number"
              min="0"
              step="any"
              value={installmentAmount}
              onChange={(e) => setInstallmentAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("debts.form.frequency")}>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Freq)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FREQS.map((f) => (
                <option key={f} value={f}>
                  {t(`common.frequency.${f}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("debts.form.frequencyInterval")}>
            <Input
              type="number"
              min="1"
              max="999"
              step="1"
              value={frequencyInterval}
              onChange={(e) =>
                setFrequencyInterval(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
              }
            />
          </Field>
        </div>

        <Field label={t("debts.form.notes")}>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas opcionales"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </ResponsiveSurface>
  );
}
