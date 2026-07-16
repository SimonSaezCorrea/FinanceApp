import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { transactions } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { ApiRequestError } from "../../../shared/lib/apiClient";
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

function dateInput(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Create OR edit a movement. Bank is required; a non-cash EXPENSE requires a
 * card; INCOME and cash expenses never carry one (mirrors the server rules).
 */
export function TransactionCreateModal({
  open,
  onOpenChange,
  initial,
  defaultBankAccountId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: transactions.Transaction;
  defaultBankAccountId?: string;
}) {
  const { t } = useTranslation();
  const { create, update } = useTransactionMutations();
  const { data: accountList } = useAccounts();
  const editing = Boolean(initial);

  const [type, setType] = useState<transactions.TransactionType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [bankAccountId, setBankAccountId] = useState(defaultBankAccountId ?? "");
  const [cardId, setCardId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [observation, setObservation] = useState("");
  const [emisor, setEmisor] = useState("");
  const [receptor, setReceptor] = useState("");
  const [lugar, setLugar] = useState("");
  const [date, setDate] = useState(todayInput());

  // Sync form state whenever the modal opens (create defaults or edit prefill).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
    setType(initial?.type ?? "EXPENSE");
    setAmount(initial?.amount ?? "");
    setCurrency(initial?.currency ?? "CLP");
    setBankAccountId(initial?.bankAccountId ?? defaultBankAccountId ?? "");
    setCardId(initial?.cardId ?? "");
    setCategory(initial?.category ?? "");
    setDescription(initial?.description ?? "");
    setObservation(initial?.observation ?? "");
    setEmisor(initial?.emisor ?? "");
    setReceptor(initial?.receptor ?? "");
    setLugar(initial?.lugar ?? "");
    setDate(initial ? dateInput(initial.occurredAt) : todayInput());
  }, [open, initial, defaultBankAccountId]);

  const accounts = accountList ?? [];
  // For a new movement, only active accounts; when editing, also keep the
  // movement's own (possibly inactive) account selectable.
  const selectable = editing
    ? accounts.filter((a) => a.status === "ACTIVE" || a.id === initial?.bankAccountId)
    : accounts.filter((a) => a.status === "ACTIVE");
  const selectedAccount = accounts.find((a) => a.id === bankAccountId);
  const isCash = selectedAccount?.type === "CASH";
  const isCreditLine = selectedAccount?.type === "CREDIT_LINE";
  // A card is REQUIRED only for credit-line expenses; optional for other non-cash accounts.
  const needsCard = type === "EXPENSE" && isCreditLine;
  const showCard = type === "EXPENSE" && !!selectedAccount && !isCash;
  const noCardsAvailable = needsCard && (selectedAccount?.cards.length ?? 0) === 0;

  const accountOptions = [
    { value: "", label: t("transactions.form.selectAccount") },
    ...selectable.map((a) => ({
      value: a.id,
      label: a.status === "ACTIVE" ? a.name : `${a.name} · ${t("accounts.status.INACTIVE")}`,
    })),
  ];
  const cardOptions = [
    { value: "", label: t("transactions.form.selectCard") },
    ...(selectedAccount?.cards ?? []).map((c) => ({
      value: c.id,
      label: `••••${c.last4} · ${c.name}`,
    })),
  ];

  function submit() {
    const cleanCard = type === "INCOME" || isCash ? undefined : cardId || undefined;
    const body = {
      type,
      amount,
      currency,
      occurredAt: new Date(`${date}T00:00:00`).toISOString(),
      bankAccountId,
      cardId: cleanCard,
      category: category || undefined,
      description: description || undefined,
      observation: observation || undefined,
      emisor: emisor || undefined,
      receptor: receptor || undefined,
      lugar: lugar || undefined,
    } satisfies transactions.CreateTransaction;

    const handlers = {
      onSuccess: () => {
        toast.success(editing ? t("transactions.updated") : t("transactions.created"));
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    };

    if (editing && initial) {
      update.mutate({ id: initial.id, body }, handlers);
    } else {
      create.mutate(body, handlers);
    }
  }

  const pending = create.isPending || update.isPending;
  const canSubmit =
    !!amount && !!bankAccountId && !(needsCard && !cardId) && !noCardsAvailable && !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("transactions.edit") : t("transactions.new")}
      className="max-w-md"
    >
      <div className="flex flex-col gap-3">
        <Segmented
          aria-label={t("transactions.form.type")}
          value={type}
          onChange={(v) => {
            setType(v);
            if (v === "INCOME") setCardId("");
          }}
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

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("transactions.form.account")} htmlFor="tx-acc">
            <Select
              id="tx-acc"
              value={bankAccountId}
              onChange={(e) => {
                setBankAccountId(e.target.value);
                setCardId("");
              }}
              options={accountOptions}
            />
          </Field>
          {showCard ? (
            <Field label={t("transactions.form.card")} htmlFor="tx-card">
              <Select
                id="tx-card"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                options={cardOptions}
                disabled={noCardsAvailable}
              />
            </Field>
          ) : (
            <div />
          )}
        </div>
        {noCardsAvailable ? (
          <p className="-mt-1 text-xs text-destructive">{t("transactions.form.noCardsHint")}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("transactions.form.category")} htmlFor="tx-cat">
            <Input id="tx-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label={t("transactions.form.date")} htmlFor="tx-date">
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label={t("transactions.form.description")} htmlFor="tx-desc">
          <Input
            id="tx-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("transactions.form.emisor")} htmlFor="tx-emisor">
            <Input id="tx-emisor" value={emisor} onChange={(e) => setEmisor(e.target.value)} />
          </Field>
          <Field label={t("transactions.form.receptor")} htmlFor="tx-receptor">
            <Input
              id="tx-receptor"
              value={receptor}
              onChange={(e) => setReceptor(e.target.value)}
            />
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
        <Button variant="accent" onClick={submit} disabled={!canSubmit}>
          {editing ? t("accounts.actions.save") : t("transactions.new")}
        </Button>
      </div>
    </Dialog>
  );
}
