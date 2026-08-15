import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { Skeleton } from "../../../shared/ui/skeleton";
import { useCardMovements } from "../hooks/useCardMovements";

function Row({
  label,
  value,
  loading,
}: Readonly<{ label: string; value: string; loading?: boolean }>) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-[14px] w-24" />
      ) : (
        <span className="text-sm font-medium">{value}</span>
      )}
    </div>
  );
}

/**
 * Everything there is to say about one card (the tile itself is the HOST's — the
 * detail/edit surface renders it above this block so the card sits in exactly the
 * same place in both of its modes), with no shell of its own: the same
 * block is what the desktop aside expands inline, what the tablet drawer shows
 * and what the phone screen fills. Actions stay with the host — where a
 * Delete/Edit pair belongs differs per format (inline row, drawer footer, pinned
 * action bar), and owning them here would fight all three.
 *
 * Two variants, because "the same information" isn't the same thing in a 320px
 * column beside a live movements table as it is on a surface covering the page:
 * - `inline` (desktop aside): the tile right above already shows the used/limit
 *   pair and the table beside it is already filtered by this card, so this drops
 *   both, leads with what the tile DOESN'T say (what's left to spend) and pairs
 *   the remaining facts two-per-row to stay short.
 * - `surface` (drawer/window): nothing else is on screen, so it carries the tile,
 *   the headline usage figure and the recent movements itself.
 */
export function CardDetailPanel({
  account,
  card,
  holder,
  variant = "surface",
  movementsAside,
  movementsHint,
}: Readonly<{
  account: accounts.BankAccount;
  card: accounts.Card;
  holder?: string;
  variant?: "inline" | "surface";
  /** Trailing content of the movements heading (e.g. "filtering the table"). */
  movementsAside?: ReactNode;
  movementsHint?: string;
}>) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const money = (v: string, currency = account.currency) => formatMoney(v, { locale, currency });
  const inline = variant === "inline";

  // The count comes from the server-side summary (the whole filtered set), never
  // folded from the rows loaded here — that would be a wrong number, not an
  // approximation.
  // The inline variant doesn't render the recent rows at all (see `recentRows`
  // below), so it must not fetch them.
  const {
    summary,
    recent,
    summaryLoading,
    loading: dataLoading,
  } = useCardMovements(account.id, card.id, { recent: !inline });

  // The panel loads as ONE block. Everything except the movements comes from the
  // already-loaded account, so it could paint immediately — but a surface where
  // five rows are filled and the sixth is still resolving reads as broken rather
  // than as loading. Deliberate trade: a beat of delay on data we have, for a
  // block that arrives whole. Labels stay visible throughout; only values wait.
  const loading = !inline && dataLoading;

  const ownLimit = card.limits.find((l) => l.currency === account.currency);
  const limitAmount = ownLimit ? ownLimit.limitAmount : account.creditLimit;
  const usedAmount = ownLimit ? ownLimit.used : card.ownUsed;
  const limit = Number(limitAmount);
  const used = Number(usedAmount);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isCredit = card.kind === "CREDIT";
  const available = money(String(Math.max(0, limit - used)));
  // Extra pools = a CardLimit in any OTHER currency (the primary's extra
  // currencies, or a non-primary card's own sub-limit outside the account's one).
  const extraPools = card.limits.filter((l) => l.currency !== account.currency);
  const expiry = `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`;
  const role = card.isPrimary ? t("cards.primaryBadge") : t("cards.additionalBadge");
  const limitSource = ownLimit ? t("cards.detail.ownLimit") : t("cards.detail.accountPool");

  const facts: Array<{ label: string; value: string }> = [
    ...(isCredit ? [{ label: t("cards.detail.role"), value: role }] : []),
    ...(inline ? [] : [{ label: t("cards.form.kind"), value: t(`cards.kind.${card.kind}`) }]),
    // The card's OWN holder wins over the account owner passed in by the host:
    // on an additional card, who carries it is the point.
    ...(card.cardholderName || holder
      ? [{ label: t("cards.detail.holder"), value: card.cardholderName ?? holder ?? "" }]
      : []),
    ...(card.isAdditional
      ? [{ label: t("cards.detail.issuedTo"), value: t("cards.form.additional") }]
      : []),
    ...(card.network
      ? [{ label: t("cards.form.network"), value: t(`cards.network.${card.network}`) }]
      : []),
    ...(card.isVirtual
      ? [{ label: t("cards.detail.format"), value: t("cards.form.virtual") }]
      : []),
    { label: t("cards.detail.expiry"), value: expiry },
    ...(isCredit ? [{ label: t("cards.detail.limitSource"), value: limitSource }] : []),
  ];

  // Built here rather than as a ternary chain inside the markup below.
  let recentRows: ReactNode = null;
  if (!inline) {
    recentRows = loading ? (
      // Never fall through to "no movements yet" while the query is still in
      // flight: that's a claim about this card, and an arriving row refutes it.
      <ul className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-[14px] w-2/5" />
              <Skeleton className="h-[11px] w-24" />
            </span>
            <Skeleton className="h-[14px] w-20 shrink-0" />
          </li>
        ))}
      </ul>
    ) : recent && recent.length > 0 ? (
      <ul className="flex flex-col">
        {recent.map((tx) => (
          <li
            key={tx.id}
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {tx.description ?? tx.category ?? t("transactions.uncategorized")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {new Date(tx.occurredAt).toLocaleDateString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </span>
            <span
              className={
                tx.type === "INCOME"
                  ? "shrink-0 text-sm font-semibold tabular-nums text-success"
                  : "shrink-0 text-sm font-semibold tabular-nums text-destructive"
              }
            >
              {tx.type === "INCOME" ? "+" : "−"}
              {money(tx.amount, tx.currency)}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">{t("transactions.empty")}</p>
    );
  }

  return (
    <div className={inline ? "flex flex-col gap-3" : "flex flex-col gap-4"}>
      {isCredit && !inline ? (
        <div>
          <p className="text-xs text-muted-foreground">{t("accounts.card.creditUsed")}</p>
          {loading ? (
            <>
              <Skeleton className="mt-1 h-[28px] w-56" />
              <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
              <Skeleton className="mt-1.5 h-[12px] w-40" />
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {money(usedAmount)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / {money(limitAmount)}
                </span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("cards.detail.available", { amount: available })}
              </p>
            </>
          )}
        </div>
      ) : null}

      {isCredit && inline ? (
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
          <span className="text-sm text-muted-foreground">{t("cards.detail.availableLabel")}</span>
          <span className="text-sm font-semibold tabular-nums">{available}</span>
        </div>
      ) : null}

      {/* Two per row inline (a 320px column runs long fast), one per row on a
          surface where each fact can take the full width. */}
      <div
        className={
          inline
            ? "grid grid-cols-2 gap-x-4 gap-y-2"
            : "flex flex-col divide-y divide-border [&>*]:py-2"
        }
      >
        {facts.map((f) => (
          <Row key={f.label} label={f.label} value={f.value} loading={loading} />
        ))}
      </div>

      {extraPools.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("cards.form.extraLimits")}
          </span>
          {extraPools.map((l) => (
            <div key={l.currency} className="flex items-center justify-between text-sm">
              <span className="font-medium">{l.currency}</span>
              {loading ? (
                <Skeleton className="h-[14px] w-28" />
              ) : (
                <span className="tabular-nums text-muted-foreground">
                  {money(l.used, l.currency)} / {money(l.limitAmount, l.currency)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{t("cards.detail.movements")}</span>
          {/* "0 movimientos" is a real answer, so it must not be shown before we
              have one — the count is a placeholder until the summary lands. */}
          {movementsAside ??
            (loading || summaryLoading ? (
              <Skeleton className="h-[13px] w-24" />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("transactions.count", { count: summary?.total ?? 0 })}
              </span>
            ))}
        </div>
        {movementsHint ? (
          <p className="flex items-center gap-1 text-xs leading-snug text-muted-foreground">
            {loading || summaryLoading ? (
              <Skeleton className="h-[12px] w-24" />
            ) : (
              <span>{t("transactions.count", { count: summary?.total ?? 0 })}.</span>
            )}
            {movementsHint}
          </p>
        ) : null}
        {recentRows}
      </div>
    </div>
  );
}
