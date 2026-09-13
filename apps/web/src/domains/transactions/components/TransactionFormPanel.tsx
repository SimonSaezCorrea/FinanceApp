import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { accountMetaLine, cardMetaLine } from "../../accounts/lib/accountMeta";
import { useCreditStatements } from "../../accounts/hooks/useAccounts";
import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { currencyPickerLabel } from "../../../shared/lib/currencyLabel";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { DetailRow } from "../../../shared/ui/detail-row";
import {
  FormBigTextField,
  FormDateField,
  FormMoreDetails,
  FormSelectField,
  FormSwitchField,
  FormTextField,
  FormTextareaField,
} from "../../../shared/ui/form";
import { Segmented } from "../../../shared/ui/segmented";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { projectedAfterSave } from "../lib/projectedBalance";
import { TransferFields } from "./TransferFields";

/** Everything the movement form edits. Owned by the shell, rendered here. */
export interface TransactionFormValue {
  /** `TRANSFER`/`PREPAY` are form modes, not `TransactionType`s — the API keeps
   * a transfer as an EXPENSE + an INCOME (see `createTransferSchema`), and a
   * prepago goes through its own endpoint entirely (see `PrepayFields`). */
  mode: transactions.TransactionType | "TRANSFER" | "PREPAY";
  amount: string;
  currency: string;
  bankAccountId: string;
  /** Destination account, transfer mode only. */
  toBankAccountId: string;
  /** Amount landing on the destination, transfer mode only. */
  amountIn: string;
  /** The account funding a prepago, prepay mode only (spec 019) — `bankAccountId`
   * is the CREDIT_CARD account being abonada, same as any other mode. */
  prepayFromAccountId: string;
  cardId: string;
  /** Issuer charge on the credit account itself (interest, fee): no card. */
  financeCharge: boolean;
  category: string;
  description: string;
  observation: string;
  emisor: string;
  receptor: string;
  lugar: string;
  date: string;
}

/** Amount/sign color per selected nav tab — the same red/green/blue the type
 * switch's own active pill already uses. */
const AMOUNT_TONE_CLASS = {
  destructive: "text-destructive",
  success: "text-success",
  info: "text-info",
  accent: "text-accent",
} as const;

/** The "0" placeholder tinted the SAME tone, just dimmed — not the neutral
 * `text-muted-foreground` every other field's placeholder uses, which read as
 * white/uncolored against a red or green amount and made the tab's own color
 * look like it only applied once you'd typed something. */
const AMOUNT_PLACEHOLDER_TONE_CLASS = {
  destructive: "placeholder:text-destructive/50",
  success: "placeholder:text-success/50",
  info: "placeholder:text-info/50",
  accent: "placeholder:text-accent/50",
} as const;

interface Props {
  value: TransactionFormValue;
  onChange: (patch: Partial<TransactionFormValue>) => void;
  accounts: accounts.BankAccount[];
  /** Accounts offered in the selectors (active ones + the edited movement's own). */
  selectable: accounts.BankAccount[];
  categoryOptions: string[];
  editing: boolean;
  /** Hidden account selector: the form was opened from inside one account. */
  accountLocked?: boolean;
  /** The movement being edited — needed to undo its own effect on the balance. */
  original?: transactions.Transaction | null;
  /** Transfers are only offered where the whole pair can be created. */
  allowTransfer?: boolean;
  /** Attachments section, injected by the shell. */
  attachments?: ReactNode;
}

/**
 * The movement form's content: the description as the editable title, the
 * amount as the protagonist (signed, with its currency), the type switch, and
 * then label/value rows — date, category, account, card, projected balance —
 * plus the optional details. No overlay: the shell owns that.
 */
export function TransactionFormPanel({
  value,
  onChange,
  accounts: accountList,
  selectable,
  categoryOptions,
  editing,
  accountLocked = false,
  original,
  allowTransfer = false,
  attachments,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();

  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: currencyPickerLabel(c.code),
  }));
  if (value.currency && !currencyOptions.some((o) => o.value === value.currency)) {
    currencyOptions.unshift({ value: value.currency, label: currencyPickerLabel(value.currency) });
  }

  const isTransfer = value.mode === "TRANSFER";
  const isPrepay = value.mode === "PREPAY";
  // A transfer's/prepago's own side is an expense on the source account, which
  // is what the projected balance and the card rules below need to reason about.
  const type: transactions.TransactionType =
    value.mode === "TRANSFER" || value.mode === "PREPAY" ? "EXPENSE" : value.mode;
  const isIncome = type === "INCOME";
  // A signed color per navigation tab, not just the sign glyph — the amount
  // reads as red/green/blue from across the panel, same as the type switch's
  // own active pill color.
  const amountTone = isTransfer ? "info" : isPrepay ? "accent" : isIncome ? "success" : "destructive";
  const selectedAccount = accountList.find((a) => a.id === value.bankAccountId);
  const isCreditLine = selectedAccount?.type === "CREDIT_CARD";
  const isCardable =
    !!selectedAccount && accountsContract.isCardableAccountType(selectedAccount.type);
  // A card is REQUIRED only for credit-line expenses; optional for other cardable
  // accounts. A transfer/prepago never carries one (FR-019 / spec 019).
  const needsCard = !isTransfer && !isPrepay && type === "EXPENSE" && isCreditLine && !value.financeCharge;
  const showCard = !isTransfer && !isPrepay && type === "EXPENSE" && isCardable && !value.financeCharge;
  const noCardsAvailable = needsCard && (selectedAccount?.cards.length ?? 0) === 0;

  const typeLabel = (accType: accounts.AccountType) => t(`accounts.type.${accType}`);
  const accountOptions = selectable.map((a) => ({
    value: a.id,
    label: a.status === "ACTIVE" ? a.name : `${a.name} · ${t("accounts.status.INACTIVE")}`,
    description: accountMetaLine(a, typeLabel),
  }));
  // "Cuenta propia" first: an expense on a cardable account doesn't NEED a
  // card (paid straight out of the account — a transfer out, a cash-like
  // withdrawal) — same convention `installments`' own merged card field uses,
  // so the default reads as a real choice instead of "nothing picked yet".
  // A CREDIT_CARD account's own expense has no such choice — it's never paid
  // "straight out of the account" (there's no cash balance to draw from), so
  // "Cuenta propia" is dropped and the primary card is offered as the default.
  const cardOptions = [
    ...(needsCard ? [] : [{ value: "", label: t("transactions.form.ownAccount") }]),
    ...(selectedAccount?.cards ?? []).map((c) => ({
      value: c.id,
      label: c.name,
      description: selectedAccount ? cardMetaLine(selectedAccount, c, typeLabel) : undefined,
    })),
  ];

  const selectedCard = selectedAccount?.cards.find((c) => c.id === value.cardId);
  // On a credit-drawn movement the money doesn't leave a balance — it eats into
  // the limit, so the row projects the AVAILABLE CREDIT instead.
  const projected = projectedAfterSave({
    account: selectedAccount,
    type,
    amount: value.amount,
    original,
    card: selectedCard,
  });

  const locale = groupingLocaleFor(value.currency, i18n.language);

  // Prepay mode (spec 019): the OPEN period of the selected CREDIT_CARD
  // account — fetched only when relevant, to show what's currently owed
  // (same figure `PayStatementPanel` already shows for a closed one).
  const { data: prepayStatements } = useCreditStatements(isPrepay ? value.bankAccountId : "");
  const openStatement = prepayStatements?.find((s) => s.status === "OPEN") ?? null;
  // A prepago's source is any of the user's own accounts with real cash —
  // never a CREDIT_CARD one, and never the account being prepaid itself.
  const prepaySourceOptions = selectable
    .filter((a) => a.type !== "CREDIT_CARD" && a.id !== value.bankAccountId)
    .map((a) => ({
      value: a.id,
      label: a.status === "ACTIVE" ? a.name : `${a.name} · ${t("accounts.status.INACTIVE")}`,
      description: accountMetaLine(a, typeLabel),
    }));

  function handleAccountChange(id: string) {
    const acc = accountList.find((a) => a.id === id);
    // A CREDIT_CARD account has no "Cuenta propia" option (see `cardOptions`
    // above) — default straight to its primary card instead of leaving the
    // required field unset.
    const defaultCardId =
      acc?.type === "CREDIT_CARD" ? (acc.cards.find((c) => c.isPrimary)?.id ?? "") : "";
    onChange({
      bankAccountId: id,
      cardId: defaultCardId,
      // Neither Ingreso nor Traspaso exist on a credit-line account (its
      // balance only moves through its own billing) — force back to Gasto.
      // "Prepagar" stays valid across two CREDIT_CARD accounts.
      ...(acc?.type === "CREDIT_CARD" && (value.mode === "INCOME" || value.mode === "TRANSFER")
        ? { mode: "EXPENSE" }
        : {}),
      ...(acc?.type !== "CREDIT_CARD" && value.mode === "PREPAY" ? { mode: "EXPENSE" } : {}),
      ...(acc ? { currency: acc.currency } : {}),
    });
  }

  // A CREDIT_CARD account's balance only ever moves through its own billing —
  // there's no "ingreso" or "traspaso" to record against it directly, so those
  // are replaced by "Prepagar" (spec 019: abonar the currently OPEN period
  // early, without waiting for a closed facturación). "Gasto" stays available
  // for an issuer charge or a manual purchase.
  const typeOptions: {
    value: TransactionFormValue["mode"];
    label: string;
    activeClassName?: string;
  }[] = [
    {
      value: "EXPENSE",
      label: t("transactions.type.EXPENSE"),
      activeClassName: "bg-destructive/15 font-semibold text-destructive",
    },
    ...(isCreditLine
      ? [
          {
            value: "PREPAY" as const,
            label: t("transactions.type.PREPAY"),
            // Accent, not destructive: same tone `BillingSection`'s own "Pagar"/
            // "Prepagar" buttons use for an action that moves money FORWARD
            // (paying down debt), as opposed to Gasto (which creates it).
            activeClassName: "bg-accent/15 font-semibold text-accent",
          },
        ]
      : [
          {
            value: "INCOME" as const,
            label: t("transactions.type.INCOME"),
            activeClassName: "bg-success/15 font-semibold text-success",
          },
        ]),
    ...(allowTransfer && !isCreditLine
      ? [
          {
            value: "TRANSFER" as const,
            label: t("transactions.type.TRANSFER"),
            activeClassName: "bg-info/15 font-semibold text-info",
          },
        ]
      : []),
  ];

  const optionalDetails: {
    key: keyof TransactionFormValue;
    label: string;
    placeholder: string;
  }[] = [
    {
      key: "emisor",
      label: t("transactions.form.emisor"),
      placeholder: t("transactions.form.emisorEmpty"),
    },
    {
      key: "receptor",
      label: t("transactions.form.receptor"),
      placeholder: t("transactions.form.receptorEmpty"),
    },
    {
      key: "lugar",
      label: t("transactions.form.lugar"),
      placeholder: t("transactions.form.lugarEmpty"),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* The description IS the movement's title: it's what the list shows and
          what the user is actually naming. */}
      <FormBigTextField
        id="tx-desc"
        value={value.description}
        onChange={(description) => onChange({ description })}
        placeholder={t("transactions.form.description")}
        aria-label={t("transactions.form.description")}
        showEditIcon
      />

      {/* Amount: sign on the left, figure as the protagonist, currency trailing.
          Both colored by the selected nav tab (red/green/blue) — the sign
          alone said too little at a glance. Sticky so it stays on screen once
          a numeric keyboard eats the viewport. */}
      <div className="sticky top-0 z-10 flex items-baseline gap-3 border-b border-border bg-card pb-3">
        <span className={cn("text-3xl font-semibold", AMOUNT_TONE_CLASS[amountTone])} aria-hidden>
          {isTransfer ? "±" : isIncome ? "+" : "−"}
        </span>
        <span
          className={cn("shrink-0 text-2xl font-bold", AMOUNT_TONE_CLASS[amountTone])}
          aria-hidden
        >
          {resolveCurrencySymbol(value.currency, currencies, i18n.language)}
        </span>
        <input
          inputMode="numeric"
          data-testid="tx-amount"
          value={formatAmountDisplay(value.amount, locale)}
          onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
          placeholder="0"
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent p-0 text-4xl font-bold tabular-nums focus-visible:outline-none",
            AMOUNT_TONE_CLASS[amountTone],
            AMOUNT_PLACEHOLDER_TONE_CLASS[amountTone],
          )}
          aria-label={t("transactions.form.amount")}
        />
        <SearchableSelect
          id="tx-currency"
          variant="inline"
          className="w-auto shrink-0"
          value={value.currency}
          onChange={(currency) => onChange({ currency })}
          options={currencyOptions}
          displayValue={value.currency}
          searchPlaceholder={t("common.search")}
          noResultsLabel={t("common.noResults")}
          aria-label={t("transactions.form.currency")}
        />
      </div>

      {/* A credit-line account only ever offers Gasto — a switch with one
          option is a control with nothing to choose, so it's dropped rather
          than shown disabled/single-pill. */}
      {typeOptions.length > 1 ? (
        <Segmented
          aria-label={t("transactions.form.type")}
          value={value.mode}
          onChange={(v: TransactionFormValue["mode"]) =>
            // Neither an income nor a transfer can carry a card.
            onChange({ mode: v, ...(v === "EXPENSE" ? {} : { cardId: "" }) })
          }
          className="w-full"
          variant="neutral"
          options={typeOptions}
        />
      ) : null}

      <div className="flex flex-col">
        <FormDateField
          id="tx-date"
          label={t("transactions.form.date")}
          value={value.date}
          onChange={(date) => onChange({ date })}
        />

        {/* Picked from the movements' own repertoire — search box + list, not
            free text, so the same icon shows up wherever this category is
            picked again. A prepago has no category of its own (the server
            always labels it "Prepago tarjeta"), so the field would mislead. */}
        {isPrepay ? null : (
          <FormSelectField
            id="tx-cat"
            label={t("transactions.form.category")}
            value={value.category}
            onChange={(category) => onChange({ category })}
            placeholder={t("transactions.form.categoryEmpty")}
            options={[
              { value: "", label: t("recurring.form.noCategory") },
              ...categoryOptions.map((c) => ({
                value: c,
                label: c,
                icon: (
                  <CategoryIcon category={c} className="h-4 w-4 shrink-0 text-muted-foreground" />
                ),
              })),
            ]}
          />
        )}

        {isTransfer ? (
          <TransferFields
            value={value}
            onChange={onChange}
            accounts={accountList}
            selectable={selectable}
            lockedFrom={accountLocked}
          />
        ) : (
          <>
            {accountLocked ? null : (
              <FormSelectField
                id="tx-acc"
                label={t("transactions.form.account")}
                value={value.bankAccountId}
                onChange={handleAccountChange}
                options={accountOptions}
                placeholder={t("transactions.form.selectAccount")}
              />
            )}

            {/* Only a credit account can receive an issuer charge, and declaring
                one drops the card field: no card made it. */}
            {isCreditLine && !isTransfer && !isPrepay && type === "EXPENSE" ? (
              <FormSwitchField
                label={t("transactions.form.financeCharge")}
                checked={value.financeCharge}
                onChange={(financeCharge) =>
                  onChange({ financeCharge, ...(financeCharge ? { cardId: "" } : {}) })
                }
              />
            ) : null}

            {/* Spec 019: a prepago needs where the money comes FROM (any of the
                user's own accounts with real cash) and, when known, what the
                period currently owes — the same figure `PayStatementPanel`
                already shows for a closed period, here for the OPEN one. */}
            {isPrepay ? (
              <>
                <FormSelectField
                  id="tx-prepay-from"
                  label={t("transactions.form.prepayFromAccount")}
                  value={value.prepayFromAccountId}
                  onChange={(prepayFromAccountId) => onChange({ prepayFromAccountId })}
                  options={prepaySourceOptions}
                  placeholder={t("transactions.form.selectAccount")}
                />
                <DetailRow
                  label={t("transactions.form.prepayCurrentlyOwed")}
                  value={
                    openStatement
                      ? formatMoney(openStatement.remainingAmount, {
                          currency: value.currency,
                          locale: i18n.language,
                        })
                      : "—"
                  }
                />
              </>
            ) : null}

            {showCard ? (
              <FormSelectField
                id="tx-card"
                label={t("transactions.form.card")}
                value={value.cardId}
                onChange={(cardId) => onChange({ cardId })}
                options={cardOptions}
                disabled={noCardsAvailable}
              />
            ) : null}
          </>
        )}

        {/* Informative: what the account looks like if this is saved — its cash
            balance, or its available credit when the movement draws on the pool.
            An em dash when neither can be stated: never a made-up figure.
            Prepay mode shows "lo que debe hoy" above instead — a projection
            here would need to reason about the pool shrinking, the opposite of
            what `projectedAfterSave` computes for an ordinary EXPENSE. */}
        {isPrepay ? null : (
          <DetailRow
            label={
              projected?.kind === "credit"
                ? t("transactions.form.projectedCredit")
                : t("transactions.form.projectedBalance")
            }
            value={
              projected === null
                ? "—"
                : formatMoney(projected.amount, {
                    currency: selectedAccount?.currency ?? value.currency,
                    locale: i18n.language,
                  })
            }
          />
        )}
      </div>

      {noCardsAvailable ? (
        <p className="-mt-2 text-xs text-destructive">{t("transactions.form.noCardsHint")}</p>
      ) : null}

      <FormMoreDetails
        defaultOpen={optionalDetails.some((field) => (value[field.key] as string).trim() !== "")}
        title={
          <>
            {t("transactions.form.moreDetails")}{" "}
            <span className="font-normal text-muted-foreground">
              · {t("transactions.form.optional")}
            </span>
          </>
        }
      >
        {optionalDetails.map((field) => (
          <FormTextField
            key={field.key}
            id={`tx-${field.key}`}
            label={field.label}
            value={value[field.key] as string}
            onChange={(v) => onChange({ [field.key]: v })}
            placeholder={field.placeholder}
            showEditIcon
          />
        ))}
      </FormMoreDetails>

      {/* A long free-text note is a paragraph, not a row value. */}
      <FormTextareaField
        id="tx-observation"
        label={t("transactions.form.observation")}
        value={value.observation}
        onChange={(observation) => onChange({ observation })}
        placeholder={t("transactions.form.observationEmpty")}
        showEditIcon
      />

      {attachments}
      {editing ? null : <div className="h-2" />}
    </div>
  );
}
