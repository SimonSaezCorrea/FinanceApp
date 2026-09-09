import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ConfirmModal } from "../../../shared/ui/overlay";
import { goalVisual } from "../lib/goalVisual";

interface Props {
  /** The goal to delete, or null when nothing is being deleted. */
  goal: savings.SavingsGoal | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

/**
 * Confirm deleting a goal — its own aportes aren't removed (the FK is
 * `SetNull`, see CLAUDE.md's savings-goal bullet): they start counting as
 * ahorro libre instead. The description says so explicitly, same reasoning
 * as `RecurringDeleteConfirm`/`DebtDeleteConfirm`.
 */
export function SavingsGoalDeleteConfirm({
  goal,
  onOpenChange,
  onConfirm,
  loading = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const visual = goal ? goalVisual(goal.id, goal.color) : null;
  const Icon = visual?.icon;

  return (
    <ConfirmModal
      open={goal !== null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t("common.confirmDeleteTitle")}
      description={
        goal ? t("savings.delete.goalDescription", { title: goal.title }) : t("common.confirmDelete")
      }
      loading={loading}
    >
      {goal && visual && Icon ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
            style={{ color: visual.color }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {goal.title}
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
            {formatMoney(goal.savedAmount, { currency: goal.currency, locale: i18n.language })}
          </span>
        </div>
      ) : null}
    </ConfirmModal>
  );
}
