import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { accounts as accountsContract } from "@finance/contracts";
import type { transactions } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Combobox } from "../../../shared/ui/combobox";
import { Dialog } from "../../../shared/ui/dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Segmented } from "../../../shared/ui/segmented";
import { Select } from "../../../shared/ui/select";
import { useTransactionMutations } from "../hooks/useTransactionMutations";
import { useTransactionsSummary } from "../hooks/useTransactions";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInput(iso: string): string {
  return iso.slice(0, 10);
}

function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
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
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: transactions.Transaction;
  defaultBankAccountId?: string;
}>) {
  const { t, i18n } = useTranslation();
  const { create, update } = useTransactionMutations();
  const { data: accountList } = useAccounts();
  // The distinct categories straight from the API, instead of fetching every
  // movement just to fold them down in the browser.
  const { data: summary } = useTransactionsSummary();
  const editing = Boolean(initial);
  const categoryOptions = summary?.categories ?? [];

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
    // The server returns amounts as decimal strings ("32000.0000") but this input is
    // integer-only (handleAmountChange strips non-digits, so it can't even represent
    // a decimal point) — keep just the integer part or the display grouping mangles
    // the decimal suffix in with the thousands separators (e.g. "32.000.0000").
    setAmount(initial?.amount ? (initial.amount.split(".")[0] ?? "") : "");
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
  const isCreditLine = selectedAccount?.type === "CREDIT_LINE";
  const isCardable =
    !!selectedAccount && accountsContract.isCardableAccountType(selectedAccount.type);
  // A card is REQUIRED only for credit-line expenses; optional for other cardable accounts
  // (CHECKING/SIGHT). SAVINGS/INVESTMENT/CASH never carry a card of their own.
  const needsCard = type === "EXPENSE" && isCreditLine;
  const showCard = type === "EXPENSE" && isCardable;
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

  function handleAccountChange(id: string) {
    setBankAccountId(id);
    setCardId("");
    const acc = accounts.find((a) => a.id === id);
    if (acc) setCurrency(acc.currency);
  }

  function handleAmountChange(raw: string) {
    setAmount(raw.replace(/\D/g, ""));
  }

  function submit() {
    const cleanCard = type === "INCOME" || !isCardable ? undefined : cardId || undefined;
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
      <div className="flex flex-col gap-4">
        <Segmented
          aria-label={t("transactions.form.type")}
          value={type}
          onChange={(v) => {
            setType(v);
            if (v === "INCOME") setCardId("");
          }}
          className="w-full"
          variant="neutral"
          options={[
            {
              value: "EXPENSE",
              label: t("transactions.type.EXPENSE"),
              activeClassName: "bg-destructive/15 font-semibold text-destructive",
            },
            {
              value: "INCOME",
              label: t("transactions.type.INCOME"),
              activeClassName: "bg-success/15 font-semibold text-success",
            },
          ]}
        />

        <div className="flex flex-col items-center gap-1 py-2">
          <span className="text-sm text-muted-foreground">{t("transactions.form.amount")}</span>
          <div className="flex items-center gap-1 text-accent">
            <span className="text-2xl font-semibold">
              {currencySymbol(currency, groupingLocaleFor(currency, i18n.language))}
            </span>
            <input
              inputMode="numeric"
              value={formatAmountDisplay(amount, groupingLocaleFor(currency, i18n.language))}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              size={Math.max(
                1,
                formatAmountDisplay(amount, groupingLocaleFor(currency, i18n.language)).length,
              )}
              className="bg-transparent text-center text-4xl font-bold tabular-nums text-accent focus-visible:outline-none"
              aria-label={t("transactions.form.amount")}
            />
          </div>
        </div>

        <Field label={t("transactions.form.description")}>
          <Input
            id="tx-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("transactions.form.descriptionPlaceholder")}
            aria-label={t("transactions.form.description")}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("transactions.form.category")}>
            <Combobox
              id="tx-cat"
              value={category}
              onChange={setCategory}
              options={categoryOptions}
              placeholder={t("transactions.filters.categoryPlaceholder")}
              aria-label={t("transactions.form.category")}
            />
          </Field>
          <Field label={t("transactions.form.date")}>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={t("transactions.form.date")}
            />
          </Field>
        </div>

        <Field label={t("transactions.form.account")}>
          <Select
            id="tx-acc"
            value={bankAccountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            options={accountOptions}
            aria-label={t("transactions.form.account")}
          />
        </Field>

        {showCard ? (
          <Field label={t("transactions.form.card")}>
            <Select
              id="tx-card"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              aria-label={t("transactions.form.card")}
              options={cardOptions}
              disabled={noCardsAvailable}
            />
          </Field>
        ) : null}
        {noCardsAvailable ? (
          <p className="-mt-2 text-xs text-destructive">{t("transactions.form.noCardsHint")}</p>
        ) : null}

        <CollapsibleSection title={t("transactions.form.moreDetails")} className="p-3">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("transactions.form.emisor")}>
                <Input
                  id="tx-emisor"
                  value={emisor}
                  onChange={(e) => setEmisor(e.target.value)}
                  aria-label={t("transactions.form.emisor")}
                />
              </Field>
              <Field label={t("transactions.form.receptor")}>
                <Input
                  id="tx-receptor"
                  value={receptor}
                  onChange={(e) => setReceptor(e.target.value)}
                  aria-label={t("transactions.form.receptor")}
                />
              </Field>
            </div>

            <Field label={t("transactions.form.lugar")}>
              <Input
                id="tx-lugar"
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                aria-label={t("transactions.form.lugar")}
              />
            </Field>

            <Field label={t("transactions.form.observation")}>
              <Input
                id="tx-obs"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                aria-label={t("transactions.form.observation")}
              />
            </Field>
          </div>
        </CollapsibleSection>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button variant="accent" onClick={submit} disabled={!canSubmit}>
          {t("transactions.form.submit")}
        </Button>
      </div>
    </Dialog>
  );
}
