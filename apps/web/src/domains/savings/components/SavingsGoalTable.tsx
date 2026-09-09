import { Archive, CircleX, PencilLine, PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { goalVisual } from "../lib/goalVisual";
import { goalPct, goalStatus, isGoalCloseable, isGoalComplete } from "../lib/savingsMetrics";

interface Props {
  /** Never empty — the caller (`SavingsRoute`) only renders a group's table
   * once it has at least one goal. */
  goals: savings.SavingsGoal[];
  currency: string;
  onSelect: (goal: savings.SavingsGoal) => void;
  onContribute: (goal: savings.SavingsGoal) => void;
  onEdit: (goal: savings.SavingsGoal) => void;
  onClose: (goal: savings.SavingsGoal) => void;
}

/**
 * Desktop table — one row per goal, columns aligned instead of squeezed into
 * a compact row. Rendered only where the columns fit (`TABLE_ROW_MIN_WIDTH`,
 * measured on the table's own container — same convention Deudas/Cuotas/
 * Movimientos already use); below that the route swaps in the compact
 * `SavingsGoalRow` list. No delete icon here, matching the compact row: it
 * stays swipe/detail-only.
 */
export function SavingsGoalTable({
  goals,
  currency,
  onSelect,
  onContribute,
  onEdit,
  onClose,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });

  return (
    <Card className="overflow-hidden rounded-[9.6px] p-0">
      <Table>
        <THead className="bg-muted/50">
          <TR>
            <TH>{t("savings.table.goal")}</TH>
            <TH>{t("savings.table.progress")}</TH>
            <TH numeric>{t("savings.table.amount")}</TH>
            <TH numeric>
              <span className="sr-only">{t("savings.table.actions")}</span>
            </TH>
          </TR>
        </THead>
        <tbody>
          {goals.map((goal) => {
            const status = goalStatus(goal, now);
            const visual = goalVisual(goal.id, goal.color);
            const Icon = visual.icon;
            const pct = goalPct(goal.savedAmount, goal.targetAmount);
            const closeable = isGoalCloseable(status);

            return (
              <TR key={goal.id} onClick={() => onSelect(goal)} className="cursor-pointer">
                <TD>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                  </div>
                </TD>

                <TD>
                  <div className="flex items-center gap-3">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-track">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: visual.color }}
                      />
                    </span>
                    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                </TD>

                <TD numeric>
                  <span className="font-medium tabular-nums text-foreground">
                    {money(goal.savedAmount)}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {t("savings.row.of", { amount: money(goal.targetAmount) })}
                  </span>
                </TD>

                <TD numeric>
                  <div
                    className="flex items-center justify-end gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("savings.row.registerContribution")}
                      onClick={() => onContribute(goal)}
                    >
                      <PlusCircle className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("savings.row.editGoal")}
                      onClick={() => onEdit(goal)}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden />
                    </Button>
                    {closeable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t(
                          isGoalComplete(status)
                            ? "savings.row.closeComplete"
                            : "savings.row.closeIncomplete",
                        )}
                        onClick={() => onClose(goal)}
                      >
                        {isGoalComplete(status) ? (
                          <Archive className="h-4 w-4" aria-hidden />
                        ) : (
                          <CircleX className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
