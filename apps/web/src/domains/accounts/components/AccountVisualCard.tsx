import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { cn } from "../../../shared/lib/cn";
import { CARD_KIND_STYLE, isCreditType } from "./accountVisuals";

/**
 * Visual "wallet" representation. Pass `card` to render a specific card (colored
 * by its `kind`, matching the create-account draft tiles); otherwise the account's
 * first card is used, or — with no cards at all — a muted/brand tile stands in for
 * the account itself. The credit pool is shared at the account level (CREDIT_LINE,
 * or any other account that's grown a CREDIT card); a card with its own sub-limit
 * shows that instead, falling back to the shared pool when it has none.
 */
export function AccountVisualCard({
  account,
  card: cardProp,
  holder,
  onClick,
  large,
}: Readonly<{
  account: accounts.BankAccount;
  card?: accounts.Card;
  holder?: string;
  onClick?: () => void;
  large?: boolean;
}>) {
  const { t, i18n } = useTranslation();
  const card = cardProp ?? account.cards[0];
  // The account has a credit pool if it's a standalone CREDIT_LINE, OR any other
  // cardable account that's grown a CREDIT-kind card (e.g. a checking add-on card).
  const hasCreditCard = account.cards.some((c) => c.kind === "CREDIT");
  const isAccountCreditPool = isCreditType(account.type) || hasCreditCard;
  // Whether THIS tile (a specific card, or the no-card account placeholder) shows
  // credit-used/limit instead of a plain balance — keyed off the card's own kind
  // when there is one, since a DEBIT card on the same account still just draws
  // on the account's real cash balance.
  const showCreditInfo = card ? card.kind === "CREDIT" : isAccountCreditPool;
  const last4 = card?.last4 ?? "••••";
  const expiry = card
    ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`
    : null;

  // A card with its OWN sub-limit (for the account's currency) shows that instead
  // of the shared account pool — a card with none implicitly draws on the full pool.
  const cardLimit = card?.limits.find((l) => l.currency === account.currency);
  const poolLimitAmount = cardLimit ? cardLimit.limitAmount : account.creditLimit;
  const poolUsedAmount = cardLimit ? cardLimit.used : account.creditUsed;
  const limit = Number(poolLimitAmount);
  const used = Number(poolUsedAmount);
  const usagePct =
    showCreditInfo && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const balance = Number(account.currentBalance);

  const gradientClass = card
    ? CARD_KIND_STYLE[card.kind]
    : isAccountCreditPool
      ? "bg-gradient-to-br from-brand to-primary text-white"
      : "bg-gradient-to-br from-secondary to-muted text-foreground";

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-2xl p-5 text-left shadow-md transition-transform",
        large ? "h-64" : "h-[12.5rem]",
        onClick && "cursor-pointer hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        gradientClass,
      )}
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold leading-tight">
              {account.institution ?? account.name}
            </p>
            <p className="text-xs opacity-80">
              {t(`accounts.type.${account.type}`)} · {account.currency}
            </p>
          </div>
          {/* Type chip: the card's own kind when there's a card, else the account type. */}
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {card ? t(`cards.kind.${card.kind}`) : isAccountCreditPool ? t("cards.title") : t(`accounts.type.${account.type}`)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {card ? (
            <>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium opacity-90">{card.name}</p>
                {card.kind === "CREDIT" ? (
                  <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                    {card.isPrimary ? t("cards.primaryBadge") : t("cards.additionalBadge")}
                  </span>
                ) : null}
              </div>
              <p className="text-base font-medium tabular-nums tracking-widest">
                •••• •••• •••• {last4}
              </p>
            </>
          ) : null}

          {showCreditInfo ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-70">{t("accounts.card.creditUsed")}</span>
              <p className="tabular-nums whitespace-nowrap">
                <span className="text-base font-semibold">
                  <MaskedAmount>{fmt(poolUsedAmount)}</MaskedAmount>
                </span>
                <span className="text-xs opacity-70">
                  {" "}
                  / <MaskedAmount>{fmt(poolLimitAmount)}</MaskedAmount>
                </span>
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
                <MaskedAmount>{fmt(account.currentBalance)}</MaskedAmount>
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
    </Tag>
  );
}
