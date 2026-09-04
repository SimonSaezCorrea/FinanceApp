import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { accounts as accountsContract } from "@finance/contracts";
import type { transactions } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { Button } from "../../../shared/ui/button";
import { FormSurface } from "../../../shared/ui/overlay";
import { transactionsApi } from "../api/transactionsApi";
import { useTransactionMutations } from "../hooks/useTransactionMutations";
import { useTransferMutations } from "../hooks/useTransferMutations";
import { useTransactionsSummary } from "../hooks/useTransactions";
import { AttachmentsSection } from "./AttachmentsSection";
import { TransactionFormPanel, type TransactionFormValue } from "./TransactionFormPanel";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInput(iso: string): string {
  return iso.slice(0, 10);
}

const emptyForm = (date: string): TransactionFormValue => ({
  mode: "EXPENSE",
  amount: "",
  currency: "CLP",
  bankAccountId: "",
  toBankAccountId: "",
  amountIn: "",
  cardId: "",
  financeCharge: false,
  category: "",
  description: "",
  observation: "",
  emisor: "",
  receptor: "",
  lugar: "",
  date,
});

/**
 * Create OR edit a movement — the shell around `TransactionFormPanel`: it owns
 * the form state, the submit and the surface, the panel owns the layout.
 *
 * Three shapes go through here: an ordinary income/expense, a transfer (which
 * is created and edited as a PAIR through its own endpoints, FR-015), and a
 * duplicate (a create pre-filled from an existing movement, dated today).
 */
export function TransactionCreateModal({
  open,
  onOpenChange,
  initial,
  duplicateFrom,
  defaultBankAccountId,
  lockAccount = false,
  onDismiss,
  onSaved,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: transactions.Transaction;
  duplicateFrom?: transactions.Transaction;
  defaultBankAccountId?: string;
  /**
   * Closed WITHOUT saving (cancel, the window's close control, the backdrop).
   * Lets the caller go back where the form was opened from — the detail panel —
   * instead of dropping the user all the way out to the list. Not fired after a
   * successful save: the saved data is what the caller then re-reads.
   */
  onDismiss?: () => void;
  /** The movement that was just created or updated — lets the caller point it
   *  out in the list, which is not necessarily at the top (rows are ordered by
   *  date, so one dated earlier lands further down). */
  onSaved?: (id: string) => void;
  /**
   * Opened from within one account's own view: the account is context, not a
   * choice, so the selector is hidden instead of offering a switch that would
   * move the movement out of the view the user is looking at.
   */
  lockAccount?: boolean;
}>) {
  const { t } = useTranslation();
  const { create, update } = useTransactionMutations();
  const transfer = useTransferMutations();
  // One key per submission attempt, not per request — a retry of a failed
  // network call reuses it, but "Guardar y crear otro" must NOT: that would
  // reject the second record as a duplicate of the first (FR-002).
  const idempotencyKey = useIdempotencyKey();
  const { data: accountList } = useAccounts();
  const { data: summary } = useTransactionsSummary();
  const editing = Boolean(initial);
  const categoryOptions = summary?.categories ?? [];

  const [form, setForm] = useState<TransactionFormValue>(() => emptyForm(todayInput()));
  // Receipts chosen BEFORE the movement exists: the id only shows up once it's
  // been created, and the panel must not close while they're still uploading.
  const [pendingAttachments, setPendingAttachments] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Distinguishes "saved, then closed" from "backed out" — both go through the
  // same `onOpenChange(false)`, but only the second one should return the user
  // to where they came from.
  const savedRef = useRef(false);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        if (!savedRef.current) onDismiss?.();
        savedRef.current = false;
      }
      onOpenChange(v);
    },
    [onDismiss, onOpenChange],
  );
  const patch = useCallback(
    (p: Partial<TransactionFormValue>) => setForm((f) => ({ ...f, ...p })),
    [],
  );

  // Editing a transfer needs its OTHER leg, which the list row doesn't carry.
  const groupId = initial?.transferGroupId ?? null;
  const { data: transferPair } = useQuery({
    queryKey: ["transactions", "transfer", groupId],
    queryFn: () => transactionsApi.transfer.get(groupId!),
    enabled: open && groupId !== null,
  });

  // Sync form state whenever the panel opens (create defaults or edit prefill).
  useEffect(() => {
    if (!open) return;
    const source = initial ?? duplicateFrom;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
    setCreatedId(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
    setForm({
      ...emptyForm(initial ? dateInput(initial.occurredAt) : todayInput()),
      mode: source?.transferGroupId ? "TRANSFER" : (source?.type ?? "EXPENSE"),
      // Amounts come back as decimal strings ("32000.0000") but this input is
      // integer-only, so keep the integer part or the grouping mangles it.
      amount: source?.amount ? (source.amount.split(".")[0] ?? "") : "",
      currency: source?.currency ?? "CLP",
      bankAccountId: source?.bankAccountId ?? defaultBankAccountId ?? "",
      cardId: source?.cardId ?? "",
      financeCharge: source?.financeCharge ?? false,
      category: source?.category ?? "",
      description: source?.description ?? "",
      observation: source?.observation ?? "",
      emisor: source?.emisor ?? "",
      receptor: source?.receptor ?? "",
      lugar: source?.lugar ?? "",
    });
  }, [open, initial, duplicateFrom, defaultBankAccountId]);

  // Both legs of a transfer, once loaded: the form always edits it from the
  // outgoing side, whichever row the user actually clicked.
  useEffect(() => {
    if (!open || !transferPair) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from a fetched pair
    setForm((f) => ({
      ...f,
      mode: "TRANSFER",
      bankAccountId: transferPair.outgoing.bankAccountId ?? "",
      toBankAccountId: transferPair.incoming.bankAccountId ?? "",
      currency: transferPair.outgoing.currency,
      amount: transferPair.outgoing.amount.split(".")[0] ?? "",
      amountIn: transferPair.incoming.amount.split(".")[0] ?? "",
    }));
  }, [open, transferPair]);

  // With the selector hidden there's no account change handler to carry the
  // account's currency into the form, so mirror it here once the account loads.
  useEffect(() => {
    if (!open || initial || !defaultBankAccountId) return;
    const acc = accountList?.find((a) => a.id === defaultBankAccountId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
    if (acc) setForm((f) => ({ ...f, currency: acc.currency }));
  }, [open, initial, defaultBankAccountId, accountList]);

  const accounts = accountList ?? [];
  // For a new movement, only active accounts; when editing, also keep the
  // movement's own (possibly inactive) account selectable.
  const selectable = editing
    ? accounts.filter((a) => a.status === "ACTIVE" || a.id === initial?.bankAccountId)
    : accounts.filter((a) => a.status === "ACTIVE");

  const isTransfer = form.mode === "TRANSFER";
  const selectedAccount = accounts.find((a) => a.id === form.bankAccountId);
  const isCreditLine = selectedAccount?.type === "CREDIT_CARD";
  const needsCard = !isTransfer && form.mode === "EXPENSE" && isCreditLine;
  const noCardsAvailable = needsCard && (selectedAccount?.cards.length ?? 0) === 0;

  const pending =
    create.isPending || update.isPending || transfer.create.isPending || transfer.update.isPending;
  const canSubmit =
    !!form.amount &&
    !!form.bankAccountId &&
    (!isTransfer || !!form.toBankAccountId) &&
    !(needsCard && !form.cardId) &&
    !noCardsAvailable &&
    !pending;

  /** Resets what changes movement to movement, keeps the working context. */
  function resetForNext() {
    setForm((f) => ({
      ...f,
      amount: "",
      amountIn: "",
      description: "",
      category: "",
      observation: "",
      emisor: "",
      receptor: "",
      lugar: "",
    }));
    // Back to the amount, which is where the next movement starts.
    document.querySelector<HTMLInputElement>('[data-testid="tx-amount"]')?.focus();
  }

  function submit(keepOpen = false) {
    const done = (saved?: { id?: string }) => {
      toast.success(editing ? t("transactions.updated") : t("transactions.created"));
      // This attempt succeeded — the next submit (another entry, or a future
      // reopening) is a genuinely new one and needs its own key.
      if (!editing) idempotencyKey.reset();
      savedRef.current = true;
      const savedId = saved?.id ?? initial?.id;
      if (savedId) onSaved?.(savedId);
      // Deferred receipts: hand the section the fresh id so it can flush them,
      // and stay open until they've landed (or failed with a Retry offered).
      if (!editing && saved?.id && pendingAttachments > 0) {
        setCreatedId(saved.id);
        return;
      }
      if (keepOpen) resetForNext();
      else handleOpenChange(false);
    };
    const handlers = {
      onSuccess: done,
      onError: (err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    };

    const occurredAt = new Date(`${form.date}T00:00:00`).toISOString();

    if (isTransfer) {
      const destination = accounts.find((a) => a.id === form.toBankAccountId);
      const body = {
        fromBankAccountId: form.bankAccountId,
        toBankAccountId: form.toBankAccountId,
        amountOut: form.amount,
        amountIn: form.amountIn || form.amount,
        currencyOut: form.currency,
        currencyIn: destination?.currency ?? form.currency,
        occurredAt,
        description: form.description || undefined,
        category: form.category || undefined,
        observation: form.observation || undefined,
        emisor: form.emisor || undefined,
        receptor: form.receptor || undefined,
        lugar: form.lugar || undefined,
      } satisfies transactions.CreateTransfer;

      // A transfer's own surface has no attachment step, so it just closes.
      const transferHandlers = { onSuccess: () => done(), onError: handlers.onError };
      if (groupId) transfer.update.mutate({ groupId, body }, transferHandlers);
      else
        transfer.create.mutate(
          { body, idempotencyKey: idempotencyKey.current() },
          transferHandlers,
        );
      return;
    }

    const selected = accounts.find((a) => a.id === form.bankAccountId);
    // Only CHECKING/SIGHT/CREDIT_CARD carry cards; anything else must send none.
    const cardable = !!selected && accountsContract.isCardableAccountType(selected.type);
    const body = {
      type: form.mode as transactions.TransactionType,
      amount: form.amount,
      currency: form.currency,
      occurredAt,
      bankAccountId: form.bankAccountId,
      cardId: form.mode === "INCOME" || !cardable ? undefined : form.cardId || undefined,
      financeCharge: form.financeCharge || undefined,
      category: form.category || undefined,
      description: form.description || undefined,
      observation: form.observation || undefined,
      emisor: form.emisor || undefined,
      receptor: form.receptor || undefined,
      lugar: form.lugar || undefined,
    } satisfies transactions.CreateTransaction;

    if (editing && initial) update.mutate({ id: initial.id, body }, handlers);
    else create.mutate({ body, idempotencyKey: idempotencyKey.current() }, handlers);
  }

  return (
    <FormSurface
      open={open}
      onOpenChange={handleOpenChange}
      mode={editing ? "edit" : "create"}
      // A movement's form is tall and is often opened from the very table it
      // will change, which stays visible behind the panel.
      surface="panel"
      // The visible title is the description, edited inside the body — the
      // header carries only the eyebrow naming what this surface is.
      eyebrow={editing ? t("transactions.form.editEyebrow") : t("transactions.form.newEyebrow")}
      title={
        <span className="sr-only">{editing ? t("transactions.edit") : t("transactions.new")}</span>
      }
      headerAside={lockAccount ? selectedAccount?.name : undefined}
      // The header's ✕ is already the way out; a Cancel button beside the two
      // save actions would be a third button competing for the same corner.
      hideCancel
      submitLabel={t("transactions.form.submit")}
      onSubmit={() => submit(false)}
      canSubmit={canSubmit}
      submitting={pending}
      // "Save and create another" only makes sense while creating.
      extraActions={
        editing ? undefined : (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            disabled={!canSubmit}
            onClick={() => submit(true)}
          >
            {t("transactions.form.saveAndNew")}
          </Button>
        )
      }
    >
      <TransactionFormPanel
        value={form}
        onChange={patch}
        accounts={accounts}
        selectable={selectable}
        categoryOptions={categoryOptions}
        editing={editing}
        // In transfer mode this locks the ORIGIN row instead of hiding the
        // account row: the origin is the account being viewed, only the
        // destination is a choice.
        accountLocked={lockAccount && !!form.bankAccountId}
        original={initial ?? null}
        // Offered from inside an account too: the whole pair can be created
        // from here (this account is just the source, pre-filled), and
        // `accountLocked` above already reveals the selector in transfer mode
        // so the origin can still be changed.
        allowTransfer
        attachments={
          <AttachmentsSection
            transactionId={initial?.id ?? createdId ?? undefined}
            onPendingCountChange={setPendingAttachments}
            onPendingSettled={(allSucceeded) => {
              // A failed upload keeps the panel open showing its Retry; a clean
              // run closes it, since the movement itself is already saved.
              if (allSucceeded) handleOpenChange(false);
            }}
          />
        }
      />
    </FormSurface>
  );
}
