import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { transactions } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { Button } from "../../../shared/ui/button";
import { Dialog } from "../../../shared/ui/dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Segmented } from "../../../shared/ui/segmented";
import { Select } from "../../../shared/ui/select";
import { useTransactionMutations } from "../hooks/useTransactionMutations";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TransactionCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { create } = useTransactionMutations();
  const { data: accountList } = useAccounts();
  const [type, setType] = useState<transactions.TransactionType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [bankAccountId, setBankAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [observation, setObservation] = useState("");
  const [emisor, setEmisor] = useState("");
  const [receptor, setReceptor] = useState("");
  const [lugar, setLugar] = useState("");
  const [date, setDate] = useState(todayInput());

  function reset() {
    setType("EXPENSE");
    setAmount("");
    setCurrency("CLP");
    setBankAccountId("");
    setCategory("");
    setDescription("");
    setObservation("");
    setEmisor("");
    setReceptor("");
    setLugar("");
    setDate(todayInput());
  }

  function submit() {
    create.mutate(
      {
        type,
        amount,
        currency,
        occurredAt: new Date(`${date}T00:00:00`).toISOString(),
        bankAccountId: bankAccountId || undefined,
        category: category || undefined,
        description: description || undefined,
        observation: observation || undefined,
        emisor: emisor || undefined,
        receptor: receptor || undefined,
        lugar: lugar || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("transactions.created"));
          reset();
          onOpenChange(false);
        },
        onError: () => toast.error(t("errors.INTERNAL_ERROR")),
      },
    );
  }

  const accountOptions = [
    { value: "", label: t("transactions.form.noAccount") },
    ...(accountList ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("transactions.new")} className="max-w-md">
      <div className="flex flex-col gap-3">
        <Segmented
          aria-label={t("transactions.form.type")}
          value={type}
          onChange={setType}
          className="w-full"
          options={[
            { value: "EXPENSE", label: t("transactions.type.EXPENSE") },
            { value: "INCOME", label: t("transactions.type.INCOME") },
          ]}
        />

        <div className="grid grid-cols-[1fr_90px] gap-3">
          <Field label={t("transactions.form.amount")} htmlFor="tx-amount">
            <Input
              id="tx-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label={t("accounts.form.currency")} htmlFor="tx-cur">
            <Input
              id="tx-cur"
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </Field>
        </div>

        <Field label={t("transactions.form.account")} htmlFor="tx-acc">
          <Select
            id="tx-acc"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            options={accountOptions}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("transactions.form.category")} htmlFor="tx-cat">
            <Input id="tx-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label={t("transactions.form.date")} htmlFor="tx-date">
            <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label={t("transactions.form.description")} htmlFor="tx-desc">
          <Input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("transactions.form.emisor")} htmlFor="tx-emisor">
            <Input id="tx-emisor" value={emisor} onChange={(e) => setEmisor(e.target.value)} />
          </Field>
          <Field label={t("transactions.form.receptor")} htmlFor="tx-receptor">
            <Input id="tx-receptor" value={receptor} onChange={(e) => setReceptor(e.target.value)} />
          </Field>
        </div>

        <Field label={t("transactions.form.lugar")} htmlFor="tx-lugar">
          <Input id="tx-lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} />
        </Field>

        <Field label={t("transactions.form.observation")} htmlFor="tx-obs">
          <Input id="tx-obs" value={observation} onChange={(e) => setObservation(e.target.value)} />
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button variant="accent" onClick={submit} disabled={create.isPending || !amount}>
          {t("transactions.new")}
        </Button>
      </div>
    </Dialog>
  );
}
