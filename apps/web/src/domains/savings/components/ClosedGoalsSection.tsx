import { Archive, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { cn } from "../../../shared/lib/cn";
import { goalPct, sumAmounts } from "../lib/savingsMetrics";

interface Props {
  goals: savings.SavingsGoal[];
  allGoals: savings.SavingsGoal[];
  accounts: { id: string; name: string }[];
  currency: string;
  onReopen: (goal: savings.SavingsGoal) => void;
}

function destinationLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  goal: savings.SavingsGoal,
  accounts: { id: string; name: string }[],
  allGoals: savings.SavingsGoal[],
): string {
  if (goal.closeDestination === "WITHDRAW_TO_ACCOUNT") {
    const account = accounts.find((a) => a.id === goal.closeAccountId);
    return t("savings.closedBlock.destinationWithdraw", { account: account?.name ?? "" });
  }
  if (goal.closeDestination === "TRANSFER_TO_GOAL") {
    const target = allGoals.find((g) => g.id === goal.closeTargetGoalId);
    return t("savings.closedBlock.destinationTransfer", { goal: target?.title ?? "" });
  }
  return t("savings.closedBlock.destinationFree");
}

/** Franja colapsable + lista de metas cerradas — README §1d. */
export function ClosedGoalsSection({
  goals,
  allGoals,
  accounts,
  currency,
  onReopen,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  if (goals.length === 0) return null;

  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });
  const total = sumAmounts(goals.map((g) => g.savedAmount));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 rounded-[9.6px] border border-border bg-card p-[12px_18px] max-sm:flex-col max-sm:items-start">
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Archive className="h-[15px] w-[15px]" aria-hidden />
          {t("savings.closedBlock.summary", { count: goals.length, amount: money(total) })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-primary"
          onClick={() => setOpen((v) => !v)}
        >
          {t(open ? "savings.closedBlock.hide" : "savings.closedBlock.show")}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </Button>
      </div>

      {open ? (
        <div className="overflow-hidden rounded-[9.6px] border border-border bg-card opacity-[0.72]">
          {goals.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-[14px] border-b border-border p-[12px_16px] last:border-b-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
                <Archive className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium text-muted-foreground line-through">
                  {g.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t("savings.closedBlock.closedOn", {
                    date: g.closedAt
                      ? new Date(g.closedAt).toLocaleDateString(i18n.language, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "",
                    destination: destinationLabel(t, g, accounts, allGoals),
                  })}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-[15px] font-medium tabular-nums text-foreground">
                  {money(g.savedAmount)}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {t("savings.closedBlock.pctOf", {
                    pct: goalPct(g.savedAmount, g.targetAmount),
                    amount: money(g.targetAmount),
                  })}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => onReopen(g)}>
                {t("savings.closedBlock.reopen")}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
