import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { isCreditType } from "./accountVisuals";

/**
 * Visual "wallet" representation (gradient credit / muted debit).
 * Pass `card` to render a specific card; otherwise the account's first card is used.
 * Credit info (cupo) lives on the account (CREDIT_LINE); every card shares it.
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
  const credit = isCreditType(account.type);
  const last4 = card?.last4 ?? "••••";
  const expiry = card
    ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`
    : null;

  const limit = Number(account.creditLimit);
  const used = Number(account.creditUsed);
  const usagePct = credit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
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
            <p className="text-sm font-semibold leading-tight">
              {account.institution ?? account.name}
            </p>
            <p className="text-xs opacity-80">
              {t(`accounts.type.${account.type}`)} · {account.currency}
            </p>
            {account.accountNumber ? (
              <p className="mt-0.5 text-xs tabular-nums opacity-80">{account.accountNumber}</p>
            ) : null}
          </div>
          {/* Type chip, like the other cards' labels. */}
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {credit ? t("cards.title") : t(`accounts.type.${account.type}`)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {card ? (
            <p className="text-base font-medium tabular-nums tracking-widest">
              •••• •••• •••• {last4}
            </p>
          ) : null}

          {credit ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-70">{t("accounts.card.creditUsed")}</span>
              <p className="tabular-nums">
                <span className="text-base font-semibold">{fmt(account.creditUsed)}</span>
                <span className="text-xs opacity-70"> / {fmt(account.creditLimit)}</span>
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white/90"
                    style={{ width: `${usagePct ?? 0}%` }}
                  />
                </div>
                {usagePct !== null ? (
                  <span className="text-xs font-medium tabular-nums opacity-90">{usagePct}%</span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs opacity-70">{t("accounts.balanceLabel")}</span>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  balance < 0 && "text-destructive",
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
