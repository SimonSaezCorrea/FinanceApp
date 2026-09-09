import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { recurring } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { SwipeRow } from "../../../shared/ui/swipe-row";
import {
  dueNote,
  formatLongDate,
  formatShortDate,
  isOverdue,
  monthlyAmount,
} from "../lib/recurringMetrics";

interface Props {
  readonly r: recurring.RecurringExpense;
  readonly accountName: string | null;
  readonly swipeOpen: boolean;
  readonly onSwipeOpenChange: (open: boolean) => void;
  readonly onSelect: () => void;
  readonly onTogglePause: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/**
 * One series row: icon chip, name + status meta, amount, row actions. From
 * `sm` up they stay always visible (tagged `data-swipe-action` so revealing
 * the swipe panel isn't also read as a tap on the row underneath); on a
 * phone, where there's no room for them, Editar/Eliminar live behind the
 * same swipe-to-reveal gesture Movimientos/Cuotas/Deudas use (`SwipeRow`) —
 * a tap still opens the detail panel, where "Pausar/Reactivar" always is.
 */
export function RecurringRow({
  r,
  accountName,
  swipeOpen,
  onSwipeOpenChange,
  onSelect,
  onTogglePause,
  onEdit,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  const overdue = isOverdue(r);
  const paused = !r.active;

  let meta: ReactNode;
  if (paused) {
    meta = t("recurring.row.pausedMeta", {
      frequency: t(`common.frequency.${r.frequency}`),
      date: formatLongDate(r.updatedAt, i18n.language),
    });
  } else if (overdue) {
    meta = t("recurring.row.overdueMeta", { date: formatShortDate(r.nextDueAt, i18n.language) });
  } else {
    const { days } = dueNote(r.nextDueAt);
    const note =
      days === 0
        ? t("recurring.due.today")
        : days === 1
          ? t("recurring.due.tomorrow")
          : t("recurring.due.inDays", { count: days });
    meta = [formatShortDate(r.nextDueAt, i18n.language), note, accountName]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <SwipeRow
        open={swipeOpen}
        onOpenChange={onSwipeOpenChange}
        onEdit={onEdit}
        onDelete={onDelete}
        onTap={onSelect}
      >
        <div
          className={cn(
            "flex cursor-pointer items-center gap-[14px] p-[12px_16px] max-sm:gap-2.5 max-sm:p-[12px_14px]",
            overdue && !paused ? "border-l-2 border-l-warning" : "border-l-2 border-l-transparent",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
            <CategoryIcon category={r.category} className="h-4 w-4" />
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-medium text-foreground">{r.label}</span>
            <span
              className={cn(
                "truncate text-xs",
                overdue && !paused ? "text-warning" : "text-muted-foreground",
              )}
            >
              {meta}
            </span>
          </span>

          <span className="w-[104px] shrink-0 text-right text-[15px] font-medium tabular-nums">
            {formatMoney(monthlyAmount(r), { locale: i18n.language, currency: r.currency })}
          </span>

          {/* `data-swipe-action`: this stays clickable on its own from `sm`
              up without also registering as a tap on the row (which would
              open the detail panel behind it). */}
          <span data-swipe-action className="flex shrink-0 items-center gap-1 max-sm:hidden">
            <RowAction
              icon={paused ? Play : Pause}
              label={t(paused ? "recurring.actions.resume" : "recurring.actions.pause")}
              onClick={onTogglePause}
            />
            <RowAction icon={Pencil} label={t("recurring.actions.edit")} onClick={onEdit} />
            <RowAction
              icon={Trash2}
              label={t("recurring.actions.delete")}
              onClick={onDelete}
              destructive
            />
          </span>
        </div>
      </SwipeRow>
    </li>
  );
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pause;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-[30px] w-[30px] items-center justify-center rounded-[7.6px] text-muted-foreground transition-colors hover:bg-muted",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
