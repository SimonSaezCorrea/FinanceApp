import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, recurring } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useTransactions } from "../../transactions/hooks/useTransactions";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { DetailRow } from "../../../shared/ui/detail-row";
import { SidePanel } from "../../../shared/ui/overlay";
import { EmptyState } from "../../../shared/ui/states";
import { formatLongDate, monthlyAmount } from "../lib/recurringMetrics";

/** Up to this many past occurrences, most recent first — same cap the handoff's
 * history section uses. */
const HISTORY_LIMIT = 4;

interface Props {
  readonly r: recurring.RecurringExpense | null;
  readonly accounts: accountsContract.BankAccount[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onTogglePause: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/**
 * Full detail of a recurring series. The "Historial de ocurrencias" section
 * reads real `Transaction` rows via `recurringExpenseId` (up to
 * `HISTORY_LIMIT`, most recent first) — but nothing in this app writes that
 * link automatically yet (no generation cron exists): today it is only ever
 * set by hand in the seed, so most series legitimately show the empty state.
 */
export function RecurringDetailPanel({ r, accounts, onOpenChange, onTogglePause, onEdit, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const { data: history } = useTransactions(
    r ? { recurringExpenseId: r.id, limit: HISTORY_LIMIT } : undefined,
    { enabled: r !== null },
  );
  if (r === null) return null;

  const account = r.bankAccountId ? (accounts.find((a) => a.id === r.bankAccountId) ?? null) : null;
  const card = r.cardId
    ? (accounts.flatMap((a) => a.cards).find((c) => c.id === r.cardId) ?? null)
    : null;
  const paused = !r.active;
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: r.currency });

  const subtitle = [
    t(`common.frequency.${r.frequency}`),
    r.interval > 1
      ? t("recurring.detail.every", {
          count: r.interval,
          unit: t(`debts.form.intervalUnit.${r.frequency}`, { count: r.interval }),
        })
      : null,
    r.category ?? t("transactions.uncategorized"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SidePanel
      open
      onOpenChange={onOpenChange}
      eyebrow={t("recurring.detail.eyebrow")}
      title={r.label}
      description={subtitle}
      headerAside={
        <Badge variant={paused ? "neutral" : "success"}>
          {t(paused ? "recurring.inactive" : "recurring.detail.active")}
        </Badge>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="text-destructive" onClick={onDelete}>
            {t("common.delete")}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onTogglePause}>
              {t(paused ? "recurring.actions.resume" : "recurring.actions.pause")}
            </Button>
            <Button variant="accent" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
              {t("common.edit")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-6">
          <Stat label={t("recurring.detail.amount")} value={money(r.amount)} />
          <Stat label={t("recurring.detail.perMonth")} value={money(monthlyAmount(r))} />
          {paused ? (
            <Stat
              label={t("recurring.detail.pausedSince")}
              value={formatLongDate(r.updatedAt, i18n.language)}
              muted
            />
          ) : (
            <Stat
              label={t("recurring.detail.next")}
              value={formatLongDate(r.nextDueAt, i18n.language)}
            />
          )}
        </div>

        <div className="flex flex-col">
          <DetailRow label={t("transactions.form.category")} value={r.category ?? "—"} />
          <DetailRow
            label={t("recurring.form.frequency")}
            value={t(`common.frequency.${r.frequency}`)}
          />
          <DetailRow
            label={t("debts.form.account")}
            value={account?.name ?? t("recurring.form.noAccount")}
          />
          <DetailRow label={t("transactions.form.card")} value={card?.name ?? t("transactions.form.noCard")} />
          <DetailRow
            label={t("recurring.form.anchorDate")}
            value={formatLongDate(r.anchorDate, i18n.language)}
          />
          <DetailRow
            label={t("recurring.detail.generation")}
            value={
              paused
                ? t("recurring.detail.suspendedSince", {
                    date: formatLongDate(r.updatedAt, i18n.language),
                  })
                : t("recurring.detail.automatic")
            }
          />
          <DetailRow label={t("recurring.form.notes")} value={r.notes ?? t("recurring.detail.noNotes")} />
        </div>

        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">{t("recurring.detail.history")}</h3>
          {history && history.length > 0 ? (
            <ul className="flex flex-col">
              {history.map((tx, i) => (
                <li
                  key={tx.id}
                  className={`flex items-center gap-3 border-b border-border px-2 py-2.5 last:border-b-0 ${
                    i === 0 ? "bg-success/5" : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm text-foreground">
                      {formatLongDate(tx.occurredAt, i18n.language)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t("recurring.detail.historyNote", {
                        account:
                          accounts.find((a) => a.id === tx.bankAccountId)?.name ??
                          t("recurring.form.noAccount"),
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-foreground">
                    {money(tx.amount)}
                  </span>
                  <Badge variant="success">{t("recurring.detail.historyBadge")}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={t("recurring.detail.historyEmpty")}
              message={t("recurring.detail.historyEmptyHint")}
            />
          )}
        </section>
      </div>
    </SidePanel>
  );
}

function Stat({
  label,
  value,
  muted,
}: Readonly<{ label: string; value: string; muted?: boolean }>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </span>
    </div>
  );
}
