import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Sparkline } from "../../../shared/ui/sparkline";
import { ACCOUNT_ICON, isCreditType } from "./accountVisuals";

/** Sum of credit-card limits matching the account currency (used / limit). */
function creditUsage(acc: accounts.BankAccount): { used: number; limit: number } | null {
  const limits = acc.cards
    .filter((c) => c.kind === "CREDIT")
    .flatMap((c) => c.limits)
    .filter((l) => l.currency === acc.currency);
  if (limits.length === 0) return null;
  const used = limits.reduce((s, l) => s + Number(l.used), 0);
  const limit = limits.reduce((s, l) => s + Number(l.limit), 0);
  return limit > 0 ? { used, limit } : null;
}

export function AccountCard({ account }: { account: accounts.BankAccount }) {
  const { t, i18n } = useTranslation();
  const Icon = ACCOUNT_ICON[account.type];
  const balance = Number(account.currentBalance);
  const last4 = account.cards[0]?.last4;
  const usage = isCreditType(account.type) ? creditUsage(account) : null;
  const usagePct = usage ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : null;
  const pct = account.balanceChangePct === null ? null : Number(account.balanceChangePct);

  return (
    <Link
      to={`/accounts/${account.id}`}
      className={cn(
        "group flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors",
        "hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {usagePct !== null ? (
          <Badge variant="accent">{t("accounts.card.usage", { pct: usagePct })}</Badge>
        ) : account.status === "INACTIVE" ? (
          <Badge variant="neutral">{t("accounts.status.INACTIVE")}</Badge>
        ) : (
          <Badge variant="neutral">{t(`accounts.type.${account.type}`)}</Badge>
        )}
      </div>

      <div>
        <p className="font-semibold leading-tight">{account.name}</p>
        <p className="text-xs text-muted-foreground">
          {account.currency}
          {last4 ? ` · ···· ${last4}` : account.institution ? ` · ${account.institution}` : ""}
        </p>
      </div>

      <p
        className={cn(
          "text-xl font-semibold tabular-nums tracking-tight",
          balance < 0 && "text-destructive",
        )}
      >
        {formatMoney(account.currentBalance, { locale: i18n.language, currency: account.currency })}
      </p>

      {usage ? (
        <div className="mt-auto">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent" style={{ width: `${usagePct}%` }} />
          </div>
        </div>
      ) : (
        <div className="mt-auto flex items-end justify-between">
          <Sparkline
            data={account.balanceSeries}
            tone={pct !== null && pct < 0 ? "danger" : "success"}
          />
          {pct !== null ? (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                pct < 0 ? "text-destructive" : "text-success",
              )}
            >
              {pct > 0 ? "+" : ""}
              {pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%
            </span>
          ) : null}
        </div>
      )}
    </Link>
  );
}
