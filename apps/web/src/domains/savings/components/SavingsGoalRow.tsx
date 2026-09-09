import { Archive, CircleX, PencilLine, PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { SwipeRow } from "../../../shared/ui/swipe-row";
import { goalVisual } from "../lib/goalVisual";
import { goalPct, goalStatus, isGoalCloseable, isGoalComplete } from "../lib/savingsMetrics";

interface Props {
  goal: savings.SavingsGoal;
  currency: string;
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onContribute: () => void;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
}

/**
 * Fila de meta: chip, título+%, montos, acciones — README §1c. Las acciones
 * de cerrar solo aparecen si `isGoalCloseable`. Sin la línea de estado (esa
 * vive solo en el panel de detalle): un texto largo ahí (p. ej. el aviso de
 * "sube a X/mes") rompía el layout de la fila, sobre todo con títulos
 * truncados. Editar/Eliminar quedan además detrás del mismo swipe-to-reveal
 * que usan Deudas/Recurrentes/Cuotas (`SwipeRow`) — un tap sigue abriendo el
 * detalle, donde vive el resto (aportar, cerrar, el estado completo).
 */
export function SavingsGoalRow({
  goal,
  currency,
  swipeOpen,
  onSwipeOpenChange,
  onSelect,
  onContribute,
  onEdit,
  onClose,
  onDelete,
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
    <div className="border-b border-border last:border-b-0">
      <SwipeRow
        open={swipeOpen}
        onOpenChange={onSwipeOpenChange}
        onEdit={onEdit}
        onDelete={onDelete}
        onTap={onSelect}
      >
        <div
          className="flex cursor-pointer items-center gap-[14px] p-[14px_16px]"
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
              <span className="truncate text-[15px] font-medium text-foreground">
                {goal.title}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-[6px] w-full rounded-full bg-track">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: visual.color }}
              />
            </div>
          </div>

          <div className="flex w-32 shrink-0 flex-col items-end">
            <span className="text-[15px] font-semibold tabular-nums text-foreground">
              {money(goal.savedAmount)}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {t("savings.row.of", { amount: money(goal.targetAmount) })}
            </span>
          </div>

          {/* `data-swipe-action`: stays clickable on its own from `sm` up
              without also registering as a tap on the row underneath. */}
          <div data-swipe-action className="hidden shrink-0 items-center gap-1 sm:flex">
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
                  isGoalComplete(status)
                    ? "savings.row.closeComplete"
                    : "savings.row.closeIncomplete",
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
      </SwipeRow>
    </div>
  );
}
