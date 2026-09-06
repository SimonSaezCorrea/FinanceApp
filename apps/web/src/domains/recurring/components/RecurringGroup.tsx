import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, recurring } from "@finance/contracts";
import { formatMoney, sumMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { monthlyAmount } from "../lib/recurringMetrics";
import { RecurringRow } from "./RecurringRow";

interface Props {
  readonly title: string;
  readonly items: recurring.RecurringExpense[];
  readonly accounts: accountsContract.BankAccount[];
  readonly paused?: boolean;
  readonly onSelect: (r: recurring.RecurringExpense) => void;
  readonly onTogglePause: (r: recurring.RecurringExpense) => void;
  readonly onEdit: (r: recurring.RecurringExpense) => void;
  readonly onDelete: (r: recurring.RecurringExpense) => void;
}

/** One periodicity group (or the Pausados group): header with its own count +
 * monthly sum, then the card of rows. Never rendered for an empty group —
 * the caller filters those out before mapping. Amounts inside a group can mix
 * currencies (a rare but valid case): each row still formats in its own. */
export function RecurringGroup({
  title,
  items,
  accounts,
  paused = false,
  onSelect,
  onTogglePause,
  onEdit,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? null;

  const meta = paused
    ? t("recurring.groups.pausedMeta", { count: items.length })
    : t("recurring.groups.activeMeta", {
        count: items.length,
        sum: sumByCurrency(items, i18n.language),
      });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </h2>
        <span className="text-[13px] text-muted-foreground">{meta}</span>
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-[9.6px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,.28)]",
          paused && "opacity-55",
        )}
      >
        <ul>
          {items.map((r) => (
            <RecurringRow
              key={r.id}
              r={r}
              accountName={accountName(r.bankAccountId)}
              onSelect={() => onSelect(r)}
              onTogglePause={() => onTogglePause(r)}
              onEdit={() => onEdit(r)}
              onDelete={() => onDelete(r)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "$150.000" when every item shares a currency; joined with " · " for the
 * rare mixed case (design assumes one currency per group). */
function sumByCurrency(items: recurring.RecurringExpense[], locale: string): string {
  const byCurrency = new Map<string, recurring.RecurringExpense[]>();
  for (const r of items) {
    byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r]);
  }
  return Array.from(byCurrency.entries())
    .map(([currency, group]) => {
      const total = sumMoney(group.map(monthlyAmount));
      return formatMoney(total, { locale, currency });
    })
    .join(" · ");
}
