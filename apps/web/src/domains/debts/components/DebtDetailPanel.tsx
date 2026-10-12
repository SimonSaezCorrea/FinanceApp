import { Ban, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, debts } from "@finance/contracts";
import { formatMoney, toMoney } from "@finance/money";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "@finance/ui/src/shared/ui/button";
import { DetailRow } from "@finance/ui/src/shared/ui/detail-row";
import { SidePanel } from "@finance/ui/src/shared/ui/overlay";
import { debtSchedule, type DebtInstallment } from "../lib/debtSchedule";
import { calcRemaining, dueInfo, formatDebtDate, leftAmount } from "../lib/debtMetrics";

interface DebtDetailPanelProps {
  readonly debt: debts.Debt | null;
  readonly accounts: accountsContract.BankAccount[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onPay: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  /** Not part of the handoff's asset list, kept from the previous UI: dropping
   * the ability to reopen a settled debt or undo the last instalment would be
   * a real feature regression the redesign doesn't call for. Surfaced as plain
   * text actions rather than new icon-buttons, to stay close to the handoff's
   * spare footer/calendar. */
  readonly onUnsettle: () => void;
  readonly onUndoPayment: () => void;
  readonly unsettlePending?: boolean;
  readonly undoPaymentPending?: boolean;
  /** "No se pagará": gives up on what is still pending (asks to confirm first). */
  readonly onWriteOff: () => void;
  /** Takes a written-off debt back: what was pending is owed again. */
  readonly onReinstate: () => void;
  readonly reinstatePending?: boolean;
}

const STATUS_BADGE = {
  paid: "success",
  partial: "warning",
  next: "accent",
  pending: "neutral",
  lost: "neutral",
} as const;

/**
 * The debt's full detail: label/value rows, a derived instalment calendar
 * (there is no per-instalment table server-side — see `debtSchedule`), and a
 * footer whose primary action opens the "Registrar abono" panel.
 */
export function DebtDetailPanel({
  debt,
  accounts,
  onOpenChange,
  onPay,
  onEdit,
  onDelete,
  onUnsettle,
  onUndoPayment,
  unsettlePending,
  undoPaymentPending,
  onWriteOff,
  onReinstate,
  reinstatePending,
}: DebtDetailPanelProps) {
  const { t, i18n } = useTranslation();

  // Retained through the close so the panel can play its exit animation
  // instead of vanishing the instant `debt` clears — see the hook's own doc.
  const d = useLastNonNull(debt);
  if (d === null) return null;

  const linkedAccount = d.paymentAccountId
    ? (accounts.find((a) => a.id === d.paymentAccountId) ?? null)
    : null;

  const isOwedToYou = d.direction === "OWED_TO_YOU";
  const isSettled = d.settledAt !== null;
  const isWrittenOff = d.writtenOffAt !== null;
  const hasInstallments = d.totalInstallments > 1;
  const left = leftAmount(d);
  // What really arrived (the server's own figure), not principal − pending: a
  // debt written off shows only what was actually paid.
  const paidAmount = d.paidAmount;
  const lost = isWrittenOff ? calcRemaining(d) : null;
  const due = dueInfo(d.dueAt);
  const schedule = debtSchedule(d);
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: d.currency });

  const dueValue = d.dueAt
    ? `${formatDebtDate(d.dueAt, i18n.language)} · ${
        due.overdue
          ? t("debts.due.agoDays", { count: due.days ?? 0 })
          : due.days === 0
            ? t("debts.due.today")
            : t("debts.due.inDays", { count: due.days ?? 0 })
      }`
    : t("debts.due.noDate");

  // The row the most recent payment landed on: the last one fully covered, or
  // the one it paid in part — that's where "Deshacer" belongs.
  const lastPaidSequence =
    schedule.find((r) => r.paidPart !== "0.0000")?.sequence ?? d.paidInstallments;
  const canUndoAny = !isSettled && !isWrittenOff && !toMoney(d.paidAmount).isZero();

  return (
    <SidePanel
      open={debt !== null}
      onOpenChange={onOpenChange}
      eyebrow={t("debts.detail.eyebrow")}
      title={d.counterparty}
      description={`${d.title ?? t("debts.detail.noTitle")} · ${t(
        `debts.direction.${d.direction}`,
      )}`}
      footer={
        isSettled || isWrittenOff ? (
          <div className="flex items-center gap-2">
            <Button variant="accent" className="flex-1" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
              {t("common.edit")}
            </Button>
            {isSettled ? (
              <Button variant="outline" onClick={onUnsettle} disabled={unsettlePending}>
                {t("debts.card.unsettle")}
              </Button>
            ) : (
              <Button variant="outline" onClick={onReinstate} disabled={reinstatePending}>
                {t("debts.writeOff.reinstate")}
              </Button>
            )}
            <Button variant="ghost" aria-label={t("common.delete")} onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="accent" className="flex-1" onClick={onPay}>
              {hasInstallments ? t("debts.card.registerPayment") : t("debts.card.markPaid")}
            </Button>
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
              {t("common.edit")}
            </Button>
            <Button
              variant="ghost"
              aria-label={t(`debts.writeOff.action.${d.direction}`)}
              title={t(`debts.writeOff.action.${d.direction}`)}
              onClick={onWriteOff}
            >
              <Ban className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" aria-label={t("common.delete")} onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col">
          <DetailRow
            label={t("debts.detail.type")}
            value={
              <span className="flex items-center gap-1.5">
                <Badge variant={isOwedToYou ? "success" : "danger"}>
                  {t(`debts.direction.${d.direction}`)}
                </Badge>
                {isWrittenOff ? (
                  <Badge variant="neutral">{t(`debts.writeOff.badge.${d.direction}`)}</Badge>
                ) : null}
              </span>
            }
          />
          <DetailRow label={t("debts.detail.totalAmount")} value={money(d.principal)} />
          <DetailRow label={t("debts.detail.paidAmount")} value={money(paidAmount)} />
          {lost !== null ? (
            <DetailRow
              label={t(`debts.writeOff.lost.${d.direction}`)}
              value={`${money(lost)} · ${formatDebtDate(d.writtenOffAt!, i18n.language)}`}
            />
          ) : (
            <DetailRow label={t("debts.detail.pending")} value={money(left)} />
          )}
          <DetailRow
            label={t("debts.detail.installments")}
            value={
              hasInstallments
                ? t(
                    schedule.some((r) => r.paidPart !== "0.0000")
                      ? "debts.detail.installmentsOfPartial"
                      : "debts.detail.installmentsOf",
                    { paid: d.paidInstallments, total: d.totalInstallments },
                  )
                : t("debts.detail.singlePayment")
            }
          />
          {linkedAccount ? (
            <DetailRow label={t("debts.form.account")}>
              <span className="flex flex-col items-end">
                <span className="text-sm font-medium text-foreground">{linkedAccount.name}</span>
                <span className="text-xs text-muted-foreground">
                  {accountMetaLine(linkedAccount, (type) => t(`accounts.type.${type}`))}
                </span>
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label={t("debts.detail.due")} value={dueValue} />
          <DetailRow label={t("debts.detail.note")} value={d.notes ?? "—"} />
        </div>

        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">{t("debts.detail.calendar")}</h3>
          <ul className="flex flex-col">
            {schedule.map((item) => {
              const canUndo = canUndoAny && item.sequence === lastPaidSequence;
              const partial = item.paidPart !== "0.0000";
              return (
                <li
                  key={item.sequence}
                  className="flex items-center gap-3 border-b border-border px-2 py-2.5 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm text-foreground">
                      {hasInstallments
                        ? t("debts.detail.installmentOf", {
                            sequence: item.sequence,
                            total: d.totalInstallments,
                          })
                        : t("debts.detail.singlePayment")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {partial
                        ? `${t("debts.detail.paidPart", { paid: money(item.paidPart) })} · `
                        : null}
                      {item.dueDate
                        ? item.dueDate.toLocaleDateString(i18n.language, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : t("debts.due.noDate")}
                    </span>
                  </span>

                  {/* An instalment paid in part shows what is still missing, not
                      its full amount — that's the figure anyone acts on. */}
                  <span className="flex shrink-0 flex-col items-end">
                    <span
                      className={cn(
                        "text-sm tabular-nums text-foreground",
                        item.status === "lost" && "text-muted-foreground line-through",
                      )}
                    >
                      {money(partial ? remainingOf(item) : item.amount)}
                    </span>
                    {partial ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {t("debts.table.ofTotal", { total: money(item.amount) })}
                      </span>
                    ) : null}
                  </span>

                  <Badge variant={STATUS_BADGE[item.status]}>
                    {item.status === "lost"
                      ? t(`debts.writeOff.badge.${d.direction}`)
                      : t(`debts.detail.status.${item.status}`)}
                  </Badge>

                  <span className="w-16 shrink-0 text-right">
                    {canUndo ? (
                      <button
                        type="button"
                        disabled={undoPaymentPending}
                        onClick={onUndoPayment}
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {t("debts.detail.undo")}
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </SidePanel>
  );
}

/** What an instalment paid in part still asks for. */
function remainingOf(item: DebtInstallment): string {
  return toMoney(item.amount).minus(item.paidPart).toString();
}
