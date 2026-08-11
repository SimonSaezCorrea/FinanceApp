import { CreditCard, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { convertApprox } from "../../../shared/lib/fx";
import { ACCOUNT_ICON, isCreditType } from "./accountVisuals";

/**
 * Credit pool (used / limit) of the account's own currency — shown for ANY account
 * carrying a credit line, not just a standalone CREDIT_LINE one (a checking account
 * with an add-on credit card has a pool too). A configured pool with 0 used is still
 * shown (the bar just reads 0%); accounts with no pool at all return null.
 */
function creditUsage(
  acc: accounts.BankAccount,
): { used: number; limit: number; pct: number } | null {
  const limit = Number(acc.creditLimit);
  if (limit <= 0) return null;
  const used = Number(acc.creditUsed);
  return { used, limit, pct: Math.min(100, Math.round((used / limit) * 100)) };
}

export function AccountCard({
  account,
  primaryCurrency,
}: Readonly<{ account: accounts.BankAccount; primaryCurrency: string }>) {
  const { t, i18n } = useTranslation();
  const Icon = ACCOUNT_ICON[account.type];
  // A standalone credit card holds no money: the card reads as debt, in the accent color.
  const isCredit = isCreditType(account.type);
  const usage = creditUsage(account);
  const pct = account.balanceChangePct === null ? null : Number(account.balanceChangePct);
  const money = (value: string) =>
    formatMoney(value, { locale: i18n.language, currency: account.currency });
  const approxInPrimary = convertApprox(
    isCredit ? `-${account.creditUsed}` : account.currentBalance,
    account.currency,
    primaryCurrency,
  );

  const subtitle = [account.institutionName ?? account.institution, account.cards[0]?.last4]
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part : `···· ${part}`))
    .join(" · ");

  return (
    <Link
      to={`/accounts/${account.id}`}
      className={cn(
        "group flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors",
        isCredit ? "border-accent/30 hover:border-accent/60" : "hover:border-primary/40",
      )}
    >
      <div className="mb-3.5 flex items-start justify-between">
        <span
          className={cn(
            "flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-chip",
            isCredit ? "text-accent" : "text-muted-foreground",
          )}
        >
          <Icon className="h-[17px] w-[17px]" aria-hidden />
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
            isCredit ? "bg-accent/15 text-accent" : "bg-chip text-muted-foreground",
          )}
        >
          {account.status === "INACTIVE"
            ? t("accounts.status.INACTIVE")
            : t(`accounts.type.${account.type}`)}
        </span>
      </div>

      <p className="text-[13.5px] font-semibold leading-tight">{account.name}</p>
      <p className="mt-0.5 text-[11px] text-dim">{subtitle || account.currency}</p>

      <p
        className={cn(
          "mt-3 text-[19px] font-bold tabular-nums tracking-tight",
          isCredit && "text-accent",
        )}
      >
        {isCredit ? `−${money(account.creditUsed)}` : money(account.currentBalance)}
      </p>

      {/* Approximate value in the user's currency (static rates — see shared/lib/fx). */}
      {approxInPrimary !== null ? (
        <p className="mt-2 text-[11px] tabular-nums text-dim">
          ≈ {formatMoney(approxInPrimary, { locale: i18n.language, currency: primaryCurrency })}{" "}
          {primaryCurrency}
        </p>
      ) : null}

      {!isCredit && pct !== null ? (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11px]",
            pct < 0 ? "text-destructive" : "text-success",
          )}
        >
          {pct < 0 ? (
            <TrendingDown className="h-3 w-3" aria-hidden />
          ) : (
            <TrendingUp className="h-3 w-3" aria-hidden />
          )}
          {t("accounts.card.trend", {
            pct: `${pct > 0 ? "+" : ""}${pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}`,
          })}
        </p>
      ) : null}

      {isCredit && account.billingCycleDay !== null ? (
        <p className="mt-2 text-[11px] text-dim">
          {t("accounts.card.billedOn", { day: account.billingCycleDay })}
        </p>
      ) : null}

      {usage ? (
        <div className="mt-auto border-t pt-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              <CreditCard className="h-[11px] w-[11px] shrink-0 text-accent" aria-hidden />
              <span className="truncate">
                {isCredit
                  ? t("accounts.card.creditUsed")
                  : t("accounts.card.cardPool", { last4: account.cards[0]?.last4 ?? "" }).trim()}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{usage.pct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-accent" style={{ width: `${usage.pct}%` }} />
          </div>
          <p className="mt-1.5 whitespace-nowrap text-[10px] tabular-nums text-dim">
            {money(account.creditUsed)} / {money(account.creditLimit)}
          </p>
        </div>
      ) : null}
    </Link>
  );
}
