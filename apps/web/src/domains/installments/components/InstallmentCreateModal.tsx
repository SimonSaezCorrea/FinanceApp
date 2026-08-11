import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { installments } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { useInstallmentMutations } from "../hooks/useInstallmentMutations";

type Freq = installments.InstallmentFrequency;

interface InstallmentCreateModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialData?: installments.InstallmentPlan;
}

const FREQS: Freq[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

export function InstallmentCreateModal({
  open,
  onOpenChange,
  initialData,
}: InstallmentCreateModalProps) {
  const { t } = useTranslation();
  const { create, update } = useInstallmentMutations();
  const isEdit = initialData !== undefined;

  const [title, setTitle] = useState("");
  const [installmentCount, setInstallmentCount] = useState(12);
  const [totalPrincipal, setTotalPrincipal] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState<Freq>("MONTHLY");
  const [frequencyInterval, setFrequencyInterval] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (initialData) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
        setTitle(initialData.title);
        setInstallmentCount(initialData.installmentCount);
        setTotalPrincipal(initialData.totalPrincipal);
        setCurrency(initialData.currency);
        setStartDate(initialData.startDate.slice(0, 10));
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
    title.trim().length > 0 &&
    (!isEdit ? installmentCount >= 1 && totalPrincipal.trim().length > 0 : true) &&
    frequencyInterval >= 1;

  function reset() {
    setTitle("");
    setInstallmentCount(12);
    setTotalPrincipal("");
    setCurrency("CLP");
    setStartDate(new Date().toISOString().slice(0, 10));
    setFrequency("MONTHLY");
    setFrequencyInterval(1);
    setNotes("");
  }

  function handleSubmit() {
    if (!isValid) return;
    if (isEdit) {
      update.mutate(
        {
          id: initialData.id,
          body: {
            title: title.trim(),
            currency: currency.trim().toUpperCase(),
            frequency,
            frequencyInterval,
            notes: notes.trim() || null,
          },
        },
        {
          onSuccess: () => {
            toast.success(t("installments.updated"));
            onOpenChange(false);
          },
          onError: () => toast.error(t("errors.INTERNAL_ERROR")),
        },
      );
    } else {
      create.mutate(
        {
          title: title.trim(),
          totalPrincipal: totalPrincipal.trim(),
          installmentCount,
          currency: currency.trim().toUpperCase(),
          startDate: new Date(startDate).toISOString(),
          frequency,
          frequencyInterval,
          notes: notes.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success(t("installments.created"));
            reset();
            onOpenChange(false);
          },
          onError: () => toast.error(t("errors.INTERNAL_ERROR")),
        },
      );
    }
  }

  const isPending = isEdit ? update.isPending : create.isPending;
  const idleLabel = isEdit ? t("common.save") : t("installments.new");
  const submitLabel = isPending ? "…" : idleLabel;

  return (
    <ResponsiveSurface
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `${t("common.edit")}: ${initialData.title}` : t("installments.new")}
    >
      <div className="flex flex-col gap-4">
        <Field label={t("installments.form.title")}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Laptop Samsung"
          />
        </Field>

        {!isEdit && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("debts.form.amount")}>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={totalPrincipal}
                  onChange={(e) => setTotalPrincipal(e.target.value)}
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

            <Field label={t("debts.form.installments")}>
              <Input
                type="number"
                min="1"
                max="600"
                step="1"
                value={installmentCount}
                onChange={(e) =>
                  setInstallmentCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                }
              />
            </Field>

            <Field label={t("debts.form.openedAt")}>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          </>
        )}

        {isEdit && (
          <Field label={t("debts.form.currency")}>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              placeholder="CLP"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("installments.form.frequency")}>
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
          <Field label={t("installments.form.frequencyInterval")}>
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
