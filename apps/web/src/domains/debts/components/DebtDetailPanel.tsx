import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, debts } from "@finance/contracts";
import { formatMoney, subtractMoney } from "@finance/money";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { DetailRow } from "../../../shared/ui/detail-row";
import { SidePanel } from "../../../shared/ui/overlay";
import { debtSchedule } from "../lib/debtSchedule";
import { dueInfo, formatDebtDate, leftAmount } from "../lib/debtMetrics";

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
}

const STATUS_BADGE = {
  paid: "success",
  next: "accent",
  pending: "neutral",
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
  const hasInstallments = d.totalInstallments > 1;
  const left = leftAmount(d);
  const paidAmount = subtractMoney(d.principal, left);
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

  const lastPaidSequence = d.paidInstallments;

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
        isSettled ? (
          <div className="flex items-center gap-2">
            <Button variant="accent" className="flex-1" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
              {t("common.edit")}
            </Button>
            <Button variant="outline" onClick={onUnsettle} disabled={unsettlePending}>
              {t("debts.card.unsettle")}
            </Button>
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
              <Badge variant={isOwedToYou ? "success" : "danger"}>
                {t(`debts.direction.${d.direction}`)}
              </Badge>
            }
          />
          <DetailRow label={t("debts.detail.totalAmount")} value={money(d.principal)} />
          <DetailRow label={t("debts.detail.paidAmount")} value={money(paidAmount)} />
          <DetailRow label={t("debts.detail.pending")} value={money(left)} />
          <DetailRow
            label={t("debts.detail.installments")}
            value={
              hasInstallments
                ? t("debts.detail.installmentsOf", {
                    paid: d.paidInstallments,
                    total: d.totalInstallments,
                  })
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
              const canUndo =
                !isSettled &&
                hasInstallments &&
                item.status === "paid" &&
                item.sequence === lastPaidSequence;
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
                      {item.dueDate
                        ? item.dueDate.toLocaleDateString(i18n.language, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : t("debts.due.noDate")}
                    </span>
                  </span>

                  <span className="shrink-0 text-sm tabular-nums text-foreground">
                    {money(item.amount)}
                  </span>

                  <Badge variant={STATUS_BADGE[item.status]}>
                    {t(`debts.detail.status.${item.status}`)}
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
