import { Archive, CircleX, PencilLine, PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { goalVisual } from "../lib/goalVisual";
import { goalPct, goalStatus, isGoalCloseable, isGoalComplete } from "../lib/savingsMetrics";
import { SavingsGoalStatusLine } from "./SavingsGoalStatusLine";

interface Props {
  goal: savings.SavingsGoal;
  currency: string;
  onSelect: () => void;
  onContribute: () => void;
  onEdit: () => void;
  onClose: () => void;
}

/** Fila de meta: chip, título+%, barra, línea de estado, montos, acciones —
 * README §1c. Las acciones de cerrar solo aparecen si `isGoalCloseable`. */
export function SavingsGoalRow({
  goal,
  currency,
  onSelect,
  onContribute,
  onEdit,
  onClose,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const status = goalStatus(goal, now);
  const visual = goalVisual(goal.id, goal.color);
  const Icon = visual.icon;
  const pct = goalPct(goal.savedAmount, goal.targetAmount);
  const closeable = isGoalCloseable(status);
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });

  return (
    <div
      onClick={onSelect}
      className="flex cursor-pointer items-center gap-[14px] border-b border-border p-[14px_16px] last:border-b-0"
      style={{ borderLeft: `2px solid ${visual.color}` }}
    >
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[15px] font-medium text-foreground">{goal.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-[6px] w-full rounded-full bg-track">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: visual.color }}
          />
        </div>
        <SavingsGoalStatusLine status={status} goal={goal} currency={currency} />
      </div>

      <div className="flex w-32 shrink-0 flex-col items-end">
        <span className="text-[15px] font-semibold tabular-nums text-foreground">
          {money(goal.savedAmount)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {t("savings.row.of", { amount: money(goal.targetAmount) })}
        </span>
      </div>

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("savings.row.registerContribution")}
          onClick={(e) => {
            e.stopPropagation();
            onContribute();
          }}
        >
          <PlusCircle className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("savings.row.editGoal")}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <PencilLine className="h-4 w-4" aria-hidden />
        </Button>
        {closeable ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={t(
              isGoalComplete(status) ? "savings.row.closeComplete" : "savings.row.closeIncomplete",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            {isGoalComplete(status) ? (
              <Archive className="h-4 w-4" aria-hidden />
            ) : (
              <CircleX className="h-4 w-4" aria-hidden />
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
