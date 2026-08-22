import { ArrowLeftRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { DetailRow } from "../../../shared/ui/detail-row";
import { CategoryIcon } from "../../../shared/ui/category-icon";

export function formatLongDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  transaction: transactions.Transaction;
  accounts: accounts.BankAccount[];
  /** Balance right after this movement, or `null` when it can't be trusted
   * (see `balanceAfterTransaction`) — the row then reads "—". */
  balanceAfter?: string | null;
  /** Opens the form focused on the optional-details section. */
  onAddDetails?: () => void;
  /** Rendered under the rows — the attachments section, when there is one. */
  children?: ReactNode;
}

/**
 * The movement detail itself, WITHOUT any overlay: an icon + title + meta line,
 * the amount as the protagonist, then label/value rows. Kept shell-free so it
 * can be tested on its own and reused if the detail ever needs to live inline.
 */
export function TransactionDetailPanel({
  transaction: tx,
  accounts,
  balanceAfter,
  onAddDetails,
  children,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  const account = tx.bankAccountId ? accounts.find((a) => a.id === tx.bankAccountId) : undefined;
  const card = tx.cardId ? account?.cards.find((c) => c.id === tx.cardId) : undefined;
  const isIncome = tx.type === "INCOME";
  const isTransfer = tx.transferGroupId !== null;

  // A transfer's counterpart row is named by direction; an ordinary movement
  // just says which account it belongs to.
  const accountLabel = isTransfer
    ? isIncome
      ? t("transactions.detail.transferFrom")
      : t("transactions.detail.transferTo")
    : t("transactions.form.account");

  const extraDetails = [
    { label: t("transactions.form.emisor"), value: tx.emisor },
    { label: t("transactions.form.receptor"), value: tx.receptor },
    { label: t("transactions.form.lugar"), value: tx.lugar },
    { label: t("transactions.form.observation"), value: tx.observation },
  ];
  const hasExtraDetails = extraDetails.some((d) => d.value);

  const meta = [formatLongDate(tx.occurredAt, i18n.language), tx.category, account?.name].filter(
    Boolean,
  );

  const accountValue = account
    ? [account.name, t(`accounts.type.${account.type}`)].join(" · ")
    : t("transactions.table.noAccount");

  return (
    <div className="flex flex-col gap-5">
      {/* Identity block: what this movement is, before how much it was. */}
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isTransfer ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
          }`}
        >
          {isTransfer ? (
            <ArrowLeftRight className="h-5 w-5" aria-hidden />
          ) : (
            <CategoryIcon category={tx.category} className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold tracking-tight">
            {tx.description ?? t(`transactions.type.${tx.type}`)}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.join(" · ")}</p>
        </div>
      </div>

      {/* The amount is the protagonist: big, left-aligned, signed, with its
          currency spelled out rather than reduced to a symbol. */}
      <div className="flex flex-col gap-2">
        <span
          className={`text-4xl font-semibold tracking-tight tabular-nums ${
            isTransfer ? "text-foreground" : isIncome ? "text-success" : "text-destructive"
          }`}
        >
          {isIncome ? "+" : "−"}
          {formatMoney(tx.amount, {
            currency: tx.currency,
            locale: i18n.language,
          })}{" "}
          <span className="text-2xl">{tx.currency}</span>
        </span>
        <div className="flex flex-wrap gap-2">
          <Badge variant={isTransfer ? "info" : isIncome ? "success" : "danger"}>
            {isTransfer ? t("transactions.type.TRANSFER") : t(`transactions.type.${tx.type}`)}
          </Badge>
          {card ? <Badge>{`•••• ${card.last4}`}</Badge> : null}
        </div>
      </div>

      {/* FR-028a: this row is an instalment's payment. Saying so — and where to go
          to change it — is the point; silently disabling the buttons would leave the
          user guessing why. */}
      {tx.installmentPlanId !== null && (
        <p className="flex gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {t("transactions.detail.installmentLocked")}{" "}
            <Link to="/installments" className="text-accent underline-offset-2 hover:underline">
              {t("transactions.detail.installmentLockedLink")}
            </Link>
          </span>
        </p>
      )}

      <div className="flex flex-col">
        {/* The category carries its icon here too: the header's icon is the
            movement's identity, this one names the category being read. */}
        <DetailRow label={t("transactions.form.category")}>
          <span className="flex items-center gap-2">
            <CategoryIcon category={tx.category} className="h-4 w-4 text-muted-foreground" />
            {tx.category ?? t("transactions.table.noCategory")}
          </span>
        </DetailRow>
        <DetailRow label={accountLabel} value={accountValue} />
        {card ? (
          <DetailRow
            label={t("transactions.form.card")}
            value={`••••${card.last4} · ${card.name}`}
          />
        ) : null}
        {/* An em dash, never an estimate, when the loaded set can't support it. */}
        <DetailRow
          label={t("transactions.detail.balanceAfter")}
          value={
            balanceAfter == null
              ? "—"
              : `${formatMoney(balanceAfter, {
                  currency: account?.currency ?? tx.currency,
                  locale: i18n.language,
                })} ${account?.currency ?? tx.currency}`
          }
        />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t("transactions.form.moreDetails")}</h3>
        {hasExtraDetails ? (
          <div className="flex flex-col">
            {extraDetails.map((d) => (
              <DetailRow key={d.label} label={d.label} value={d.value || "—"} />
            ))}
          </div>
        ) : (
          // One sentence instead of four empty rows (FR-003).
          <p className="text-sm text-muted-foreground">
            {t("transactions.detail.noDetails")}{" "}
            {onAddDetails ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 align-baseline text-sm text-brand hover:bg-transparent hover:underline"
                onClick={onAddDetails}
              >
                {t("transactions.detail.addDetails")}
              </Button>
            ) : null}
          </p>
        )}
      </section>

      {children}
    </div>
  );
}
