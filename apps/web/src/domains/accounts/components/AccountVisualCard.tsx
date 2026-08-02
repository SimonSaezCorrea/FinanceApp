import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { cn } from "../../../shared/lib/cn";
import { CARD_KIND_STYLE, isCreditType } from "./accountVisuals";

/**
 * Visual "wallet" representation. Pass `card` to render a specific card (colored
 * by its `kind`, matching the create-account draft tiles); otherwise the account's
 * first card is used as a stand-in (e.g. a Wallet pin of the account itself, with
 * no specific card chosen), or — with no cards at all — a muted/brand tile stands
 * in for the account itself. Pass `accountOnly` to force the genuine account-level
 * view instead of that first-card stand-in, even when the account has cards (e.g.
 * a dedicated "this is the account" summary tile shown alongside its own cards).
 *
 * The credit LIMIT is shared at the account level (CREDIT_LINE, or any other
 * account that's grown a CREDIT card); a card with its own sub-limit shows that
 * instead. The USED amount, though, is per-card: a card sharing the pool shows its
 * own individual spend (`card.ownUsed`), not the fully-combined total — only the
 * no-`card` account-level tile (including under `accountOnly`) shows that total.
 */
export function AccountVisualCard({
  account,
  card: cardProp,
  accountOnly = false,
  holder,
  onClick,
  large,
}: Readonly<{
  account: accounts.BankAccount;
  card?: accounts.Card;
  accountOnly?: boolean;
  holder?: string;
  onClick?: () => void;
  large?: boolean;
}>) {
  const { t, i18n } = useTranslation();
  const card = accountOnly ? undefined : (cardProp ?? account.cards[0]);
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
  // of the shared account pool. A card that shares the pool (no sub-limit of its
  // own) still shows the shared LIMIT, but its own individual usage (`ownUsed`)
  // rather than the fully-combined pool total — each card tracks its own spend
  // for management/analysis, while the account-level view (no specific `card`)
  // is the only place the true combined total is shown.
  const cardLimit = card?.limits.find((l) => l.currency === account.currency);
  const poolLimitAmount = cardLimit ? cardLimit.limitAmount : account.creditLimit;
  const poolUsedAmount = cardLimit ? cardLimit.used : card ? card.ownUsed : account.creditUsed;
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
        // `shrink-0`: the tile has a fixed height and must keep it inside a
        // scrolling flex column (the account-detail aside), never be squashed.
        "relative flex w-full shrink-0 flex-col overflow-hidden rounded-2xl p-5 text-left shadow-md transition-transform",
        // min-, not fixed: the account-level tile carries an extra row (the account
        // number) and must grow instead of clipping it.
        large ? "min-h-64" : "min-h-[12.5rem]",
        onClick &&
          "cursor-pointer hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
            {card
              ? t(`cards.kind.${card.kind}`)
              : isAccountCreditPool
                ? t("cards.title")
                : t(`accounts.type.${account.type}`)}
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

          {/* Account-level tile: the bank account number takes the place a card's
              masked PAN would occupy (it's stored/shown in full — not a PAN). */}
          {!card && account.accountNumber ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs opacity-70">{t("accounts.form.accountNumber")}</span>
              <p className="text-base font-medium tabular-nums tracking-wider">
                {account.accountNumber}
              </p>
            </div>
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
