import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SidePanel } from "../../../shared/ui/overlay";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Segmented } from "../../../shared/ui/segmented";
import { useAccountMutations, useAccounts } from "../hooks/useAccounts";

const STATUS_VARIANT = {
  OPEN: "info",
  PENDING: "warning",
  // Settled, but not for its full amount — success would overstate it.
  PARTIALLY_PAID: "warning",
  PAID: "success",
} as const;

type PayMode = "total" | "minimum" | "custom";

/** `<input type="date">` wants YYYY-MM-DD in LOCAL time — `toISOString` would
 *  hand it the UTC day, which is the previous one for anyone west of Greenwich. */
function todayLocalISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Pay a statement, in the same right-side `SidePanel` the card and account
 * screens use: a header (period, account, card, status), what the period is made
 * of, how much to pay, from where, and the consequences.
 *
 * Paying moves real money, so the panel never hides a figure it knows: the
 * breakdown of the period, the balance left in the source account, and what would
 * still be owed after a partial payment. A source that can't cover the amount is
 * flagged but never blocked — that account may be settled elsewhere.
 *
 * Default source: THIS account, when it is the kind that holds money (a checking
 * or sight account that grew a credit card pays its own statement). A standalone
 * credit line has no balance of its own, so nothing is preselected.
 */
export function PayStatementPanel({
  account,
  statement,
  onOpenChange,
}: Readonly<{
  account: accounts.BankAccount;
  statement: accounts.CreditStatement | null;
  onOpenChange: (v: boolean) => void;
}>) {
  const { t, i18n } = useTranslation();
  const { data: allAccounts } = useAccounts();
  const { payCreditStatement } = useAccountMutations();
  const [fromAccountId, setFromAccountId] = useState("");
  const [mode, setMode] = useState<PayMode>("total");
  const [customAmount, setCustomAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayLocalISO);
  const [reference, setReference] = useState("");

  const sources = (allAccounts ?? []).filter(
    (a) => a.type !== "CREDIT_LINE" && a.status === "ACTIVE",
  );
  const selfPayable = sources.some((a) => a.id === account.id);
  // Derived, not written into state by an effect: an effect would fire a second
  // render per open and fight a choice made before the accounts list loaded.
  const selected = fromAccountId || (selfPayable ? account.id : "");
  const from = sources.find((a) => a.id === selected);

  const money = (v: string, currency: string) =>
    formatMoney(v, { locale: i18n.language, currency });

  function close() {
    setFromAccountId("");
    setMode("total");
    setCustomAmount("");
    setPaidAt(todayLocalISO());
    setReference("");
    onOpenChange(false);
  }

  if (!statement) return null;

  const remaining = Number(statement.remainingAmount);
  const minimum = statement.minimumAmount === null ? null : Number(statement.minimumAmount);
  // A minimum bigger than what's left (a period already paid down past it) isn't
  // a payable option — offering it would only produce a rejected request.
  const minimumPayable = minimum !== null && minimum > 0 && minimum <= remaining;
  // Two different reasons to be unavailable, and they must not share one message:
  // "you never configured a minimum" is fixable in settings, "you already paid
  // past it" is just this period's state.
  const minimumReason =
    minimum === null || minimum <= 0
      ? t("accounts.detail.payMinimumUnset")
      : t("accounts.detail.payMinimumCovered");

  let amount: number;
  if (mode === "total") amount = remaining;
  else if (mode === "minimum") amount = minimum ?? 0;
  else amount = Number(customAmount || 0);

  const overRemaining = amount > remaining;
  const invalidAmount = !Number.isFinite(amount) || amount <= 0 || overRemaining;
  const leftAfter = Math.max(0, remaining - (Number.isFinite(amount) ? amount : 0));
  const insufficient = from ? Number(from.currentBalance) < amount : false;
  const otherCurrency = from ? from.currency !== account.currency : false;

  const period = new Date(statement.periodStart).toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // The card the statement belongs to: the account's primary credit card, whose
  // limit IS this pool (see the accounts domain rules).
  const primaryCard = account.cards.find((c) => c.kind === "CREDIT" && c.isPrimary);
  const subtitle = [account.name, primaryCard ? `•••• ${primaryCard.last4}` : null]
    .filter(Boolean)
    .join(" · ");

  const modeHint = () => {
    if (overRemaining) return t("errors.PAYMENT_EXCEEDS_REMAINING");
    if (mode === "total") return t("accounts.detail.payCoversTotal");
    if (mode === "minimum")
      return t("accounts.detail.payCoversMinimum", {
        percent: account.minimumPaymentPercent ?? "",
      });
    return t("accounts.detail.payCoversCustom");
  };

  return (
    <SidePanel
      open={statement !== null}
      onOpenChange={(v) => !v && close()}
      eyebrow={t("accounts.detail.payEyebrow")}
      title={t("accounts.detail.payPeriodTitle", { date: period })}
      description={subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="accent"
            disabled={!selected || invalidAmount || payCreditStatement.isPending}
            onClick={() =>
              payCreditStatement.mutate(
                {
                  id: account.id,
                  statementId: statement.id,
                  body: {
                    fromAccountId: selected,
                    // Omitted when paying in full: the server settles whatever is
                    // owed, so a figure that went stale between opening this panel
                    // and pressing the button can't underpay the period.
                    amount: mode === "total" ? undefined : String(amount),
                    paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
                    reference: reference.trim() || undefined,
                  },
                },
                {
                  onSuccess: () => {
                    toast.success(t("accounts.actions.payCreditSuccess"));
                    close();
                  },
                  onError: (err) => {
                    const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
                    toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
                  },
                },
              )
            }
          >
            {/* The amount rides on the action: the last thing read before paying
                should be what gets paid, not a generic verb. */}
            {t("accounts.detail.payAction", {
              amount: money(String(Number.isFinite(amount) ? amount : 0), account.currency),
            })}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Badge variant={STATUS_VARIANT[statement.status]} className="self-start">
          {t(`accounts.detail.billingStatusValue.${statement.status}`)}
        </Badge>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            aria-label={t("accounts.detail.paySummaryAmount")}
            options={[
              { value: "total", label: t("accounts.detail.payModeTotal") },
              {
                value: "minimum",
                label: t("accounts.detail.payModeMinimum"),
                disabled: !minimumPayable,
                disabledReason: minimumReason,
              },
              { value: "custom", label: t("accounts.detail.payModeCustom") },
            ]}
          />

          <div>
            <p className="text-xs text-muted-foreground">{t("accounts.detail.paySummaryAmount")}</p>
            {mode === "custom" ? (
              <Input
                className="mt-1 h-12 text-2xl font-semibold tabular-nums"
                inputMode="decimal"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d.]/g, ""))}
                aria-label={t("accounts.detail.payAmountLabel")}
              />
            ) : (
              <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight">
                {money(String(amount), account.currency)}
              </p>
            )}
            <p
              className={cn(
                "mt-1 text-xs",
                overRemaining ? "text-warning" : "text-muted-foreground",
              )}
            >
              {modeHint()}
            </p>
          </div>

          {/* What the period is made of — derived from its own movements. */}
          <dl className="flex flex-col gap-1 border-t border-border pt-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("accounts.detail.payBreakdownPurchases")}
              </dt>
              <dd className="font-medium tabular-nums">
                {money(statement.breakdown.purchases, account.currency)}
              </dd>
            </div>
            {statement.breakdown.installmentCount > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("accounts.detail.payBreakdownInstallments", {
                    count: statement.breakdown.installmentCount,
                  })}
                </dt>
                <dd className="font-medium tabular-nums">
                  {money(statement.breakdown.installments, account.currency)}
                </dd>
              </div>
            ) : null}
            {/* Debt the previous period couldn't cover: part of what's owed
                here, but not one of this period's own movements. */}
            {Number(statement.carriedOverAmount) > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("accounts.detail.payCarriedOver")}</dt>
                <dd className="font-medium tabular-nums text-warning">
                  {money(statement.carriedOverAmount, account.currency)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <Field label={t("accounts.detail.payFromAccount")}>
          <SearchableSelect
            value={selected}
            onChange={setFromAccountId}
            placeholder={t("accounts.detail.payFromAccountPlaceholder")}
            options={sources.map((a) => ({
              value: a.id,
              label:
                a.id === account.id
                  ? `${a.name} · ${t("accounts.detail.payThisAccount")}`
                  : `${a.name} — ${money(a.currentBalance, a.currency)}`,
            }))}
            aria-label={t("accounts.detail.payFromAccount")}
          />
        </Field>

        {from ? (
          <div className="flex flex-col gap-1.5 text-xs">
            {/* Only meaningful in one currency — this app applies no conversion. */}
            {otherCurrency ? null : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {t("accounts.detail.payBalanceAfter")}
                </span>
                <span className={cn("font-medium tabular-nums", insufficient && "text-warning")}>
                  {money(String(Number(from.currentBalance) - amount), from.currency)}
                </span>
              </div>
            )}
            {leftAfter > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {t("accounts.detail.payRemainingAfter")}
                </span>
                <span className="font-medium tabular-nums text-warning">
                  {money(String(leftAfter), account.currency)}
                </span>
              </div>
            ) : null}
            {insufficient ? (
              <p className="text-warning">{t("accounts.detail.payInsufficient")}</p>
            ) : null}
            {otherCurrency ? (
              <p className="text-muted-foreground">{t("accounts.detail.payDifferentCurrency")}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("accounts.detail.payDate")}>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              aria-label={t("accounts.detail.payDate")}
            />
          </Field>
          <Field label={t("accounts.detail.payReference")}>
            <Input
              value={reference}
              placeholder={t("accounts.detail.payReferencePlaceholder")}
              onChange={(e) => setReference(e.target.value)}
              aria-label={t("accounts.detail.payReference")}
            />
          </Field>
        </div>

        <p className="border-l-2 border-brand/40 pl-3 text-xs text-muted-foreground">
          {t("accounts.detail.payCreatesMovement")}
        </p>
      </div>
    </SidePanel>
  );
}
