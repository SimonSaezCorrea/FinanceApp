import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { Combobox } from "../../../shared/ui/combobox";
import { DetailRow } from "../../../shared/ui/detail-row";
import { DateField } from "../../../shared/ui/date-field";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Switch } from "../../../shared/ui/switch";
import { Segmented } from "../../../shared/ui/segmented";
import { CategoryIcon } from "./CategoryIcon";
import { projectedAfterSave } from "../lib/projectedBalance";
import { TransferFields } from "./TransferFields";

/** Everything the movement form edits. Owned by the shell, rendered here. */
export interface TransactionFormValue {
  /** `TRANSFER` is a form mode, not a `TransactionType` — the API keeps the pair
   * as an EXPENSE + an INCOME (see `createTransferSchema`). */
  mode: transactions.TransactionType | "TRANSFER";
  amount: string;
  currency: string;
  bankAccountId: string;
  /** Destination account, transfer mode only. */
  toBankAccountId: string;
  /** Amount landing on the destination, transfer mode only. */
  amountIn: string;
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

/** Right-hand inline field of a label/value row — reads as text until focused. */
const ROW_FIELD =
  "h-8 w-full max-w-[13rem] border-0 bg-transparent p-0 text-right text-sm font-medium text-foreground shadow-none " +
  // No ring and no outline: inside a label/value row the focus box read as a
  // rendering glitch. The caret plus the row's own hover is the affordance.
  "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";

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

  const isTransfer = value.mode === "TRANSFER";
  // A transfer's own side is an expense on the source account, which is what the
  // projected balance and the card rules below need to reason about.
  const type: transactions.TransactionType = value.mode === "TRANSFER" ? "EXPENSE" : value.mode;
  const isIncome = type === "INCOME";
  const selectedAccount = accountList.find((a) => a.id === value.bankAccountId);
  const isCreditLine = selectedAccount?.type === "CREDIT_CARD";
  const isCardable =
    !!selectedAccount && accountsContract.isCardableAccountType(selectedAccount.type);
  // A card is REQUIRED only for credit-line expenses; optional for other cardable
  // accounts. A transfer never carries one (FR-019).
  const needsCard = !isTransfer && type === "EXPENSE" && isCreditLine && !value.financeCharge;
  const showCard = !isTransfer && type === "EXPENSE" && isCardable && !value.financeCharge;
  const noCardsAvailable = needsCard && (selectedAccount?.cards.length ?? 0) === 0;

  const accountOptions = [
    ...selectable.map((a) => ({
      value: a.id,
      label: a.status === "ACTIVE" ? a.name : `${a.name} · ${t("accounts.status.INACTIVE")}`,
    })),
  ];
  const cardOptions = [
    ...(selectedAccount?.cards ?? []).map((c) => ({
      value: c.id,
      label: `••••${c.last4} · ${c.name}`,
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

  function handleAccountChange(id: string) {
    const acc = accountList.find((a) => a.id === id);
    onChange({ bankAccountId: id, cardId: "", ...(acc ? { currency: acc.currency } : {}) });
  }

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
    {
      value: "INCOME",
      label: t("transactions.type.INCOME"),
      activeClassName: "bg-success/15 font-semibold text-success",
    },
    ...(allowTransfer
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
    {
      key: "observation",
      label: t("transactions.form.observation"),
      placeholder: t("transactions.form.observationEmpty"),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* The description IS the movement's title: it's what the list shows and
          what the user is actually naming. */}
      <input
        id="tx-desc"
        value={value.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder={t("transactions.form.description")}
        aria-label={t("transactions.form.description")}
        className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
      />

      {/* Amount: sign on the left, figure as the protagonist, currency trailing.
          Sticky so it stays on screen once a numeric keyboard eats the viewport. */}
      <div className="sticky top-0 z-10 flex items-baseline gap-3 border-b border-border bg-card pb-3">
        <span
          className={cn(
            "text-3xl font-semibold",
            isTransfer ? "text-foreground" : isIncome ? "text-success" : "text-destructive",
          )}
          aria-hidden
        >
          {isIncome ? "+" : "−"}
        </span>
        <input
          inputMode="numeric"
          data-testid="tx-amount"
          value={formatAmountDisplay(value.amount, locale)}
          onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
          placeholder="0"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-4xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          aria-label={t("transactions.form.amount")}
        />
        <span className="shrink-0 text-sm font-medium text-muted-foreground">{value.currency}</span>
      </div>

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

      <div className="flex flex-col">
        <DetailRow label={t("transactions.form.date")}>
          <DateField
            id="tx-date"
            variant="inline"
            value={value.date}
            onChange={(date) => onChange({ date })}
            aria-label={t("transactions.form.date")}
          />
        </DetailRow>

        {/* The icon sits between the value and the chevron (text · icon · ▾) so
            it reads as part of the value, and repeats in the list so the options
            can be scanned by shape instead of by reading each word. */}
        <DetailRow label={t("transactions.form.category")}>
          <Combobox
            id="tx-cat"
            variant="inline"
            value={value.category}
            onChange={(v) => onChange({ category: v })}
            options={categoryOptions}
            placeholder={t("transactions.form.categoryEmpty")}
            aria-label={t("transactions.form.category")}
            className="w-full max-w-[13rem]"
            adornment={<CategoryIcon category={value.category || null} className="h-4 w-4" />}
            renderOption={(option) => (
              <>
                <CategoryIcon
                  category={option}
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 break-words">{option}</span>
              </>
            )}
          />
        </DetailRow>

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
              <DetailRow label={t("transactions.form.account")}>
                <SearchableSelect
                  id="tx-acc"
                  variant="inline"
                  className="w-auto"
                  value={value.bankAccountId}
                  onChange={handleAccountChange}
                  options={accountOptions}
                  placeholder={t("transactions.form.selectAccount")}
                  searchPlaceholder={t("common.search")}
                  noResultsLabel={t("common.noResults")}
                  aria-label={t("transactions.form.account")}
                />
              </DetailRow>
            )}

            {/* Only a credit account can receive an issuer charge, and declaring
                one drops the card field: no card made it. */}
            {isCreditLine && !isTransfer && type === "EXPENSE" ? (
              <DetailRow label={t("transactions.form.financeCharge")}>
                <Switch
                  checked={value.financeCharge}
                  onCheckedChange={(financeCharge) =>
                    onChange({ financeCharge, ...(financeCharge ? { cardId: "" } : {}) })
                  }
                  aria-label={t("transactions.form.financeCharge")}
                />
              </DetailRow>
            ) : null}

            {showCard ? (
              <DetailRow label={t("transactions.form.card")}>
                <SearchableSelect
                  id="tx-card"
                  variant="inline"
                  className="w-auto"
                  value={value.cardId}
                  onChange={(cardId) => onChange({ cardId })}
                  aria-label={t("transactions.form.card")}
                  options={cardOptions}
                  placeholder={t("transactions.form.selectCard")}
                  searchPlaceholder={t("common.search")}
                  noResultsLabel={t("common.noResults")}
                  disabled={noCardsAvailable}
                />
              </DetailRow>
            ) : null}
          </>
        )}

        {/* Informative: what the account looks like if this is saved — its cash
            balance, or its available credit when the movement draws on the pool.
            An em dash when neither can be stated: never a made-up figure. */}
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
      </div>

      {noCardsAvailable ? (
        <p className="-mt-2 text-xs text-destructive">{t("transactions.form.noCardsHint")}</p>
      ) : null}

      <section className="flex flex-col">
        <h3 className="pb-1 text-sm font-semibold">
          {t("transactions.form.moreDetails")}{" "}
          <span className="font-normal text-muted-foreground">
            · {t("transactions.form.optional")}
          </span>
        </h3>
        {optionalDetails.map((field) => (
          <DetailRow key={field.key} label={field.label}>
            <input
              id={`tx-${field.key}`}
              value={value[field.key] as string}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
              placeholder={field.placeholder}
              aria-label={field.label}
              className={cn(ROW_FIELD, "placeholder:text-muted-foreground")}
            />
          </DetailRow>
        ))}
      </section>

      {attachments}
      {editing ? null : <div className="h-2" />}
    </div>
  );
}
