import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { isCreditType } from "./accountVisuals";

/** Credit-limit row matching the account currency (falls back to the first limit). */
function pickLimit(limits: accounts.CardLimit[], currency: string): accounts.CardLimit | undefined {
  return limits.find((l) => l.currency === currency) ?? limits[0];
}

/**
 * Visual "wallet" representation (gradient credit / muted debit).
 * Pass `card` to render a specific card; otherwise the account's first card is used.
 * Shows the account balance, or used/limit for credit.
 */
export function AccountVisualCard({
  account,
  card: cardProp,
  holder,
}: {
  account: accounts.BankAccount;
  card?: accounts.Card;
  holder?: string;
}) {
  const { t, i18n } = useTranslation();
  const card = cardProp ?? account.cards[0];
  const credit = card ? card.kind === "CREDIT" : isCreditType(account.type);
  const last4 = card?.last4 ?? "••••";
  const expiry = card ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}` : null;

  const limits = card ? card.limits : account.cards.flatMap((c) => (c.kind === "CREDIT" ? c.limits : []));
  const creditLimit = credit ? pickLimit(limits, account.currency) : undefined;
  const usagePct = creditLimit
    ? Math.min(100, Math.round((Number(creditLimit.used) / Number(creditLimit.limit)) * 100))
    : null;
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const balance = Number(account.currentBalance);

  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-2xl p-5 shadow-md",
        credit
          ? "bg-gradient-to-br from-brand to-primary text-white"
          : "bg-gradient-to-br from-secondary to-muted text-foreground",
      )}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold leading-tight">{account.institution ?? account.name}</p>
            <p className="text-xs opacity-80">
              {t(`accounts.type.${account.type}`)} · {account.currency}
            </p>
          </div>
          <span className="h-7 w-9 rounded-md bg-white/25" aria-hidden />
        </div>

        <div className="flex flex-col gap-1">
          {card ? (
            <p className="text-base font-medium tabular-nums tracking-widest">
              •••• •••• •••• {last4}
            </p>
          ) : null}

          {creditLimit ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-70">{t("accounts.card.creditUsed")}</span>
              <p className="tabular-nums">
                <span className="text-base font-semibold">{fmt(creditLimit.used)}</span>
                <span className="text-xs opacity-70"> / {fmt(creditLimit.limit)}</span>
              </p>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white/90" style={{ width: `${usagePct}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs opacity-70">{t("accounts.balanceLabel")}</span>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  balance < 0 && !credit && "text-destructive",
                )}
              >
                {fmt(account.currentBalance)}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between">
          {holder ? (
            <span className="text-xs font-medium uppercase tracking-wide opacity-90">{holder}</span>
          ) : (
            <span />
          )}
          {expiry ? <span className="text-xs tabular-nums opacity-90">{expiry}</span> : null}
        </div>
      </div>
    </div>
  );
}
