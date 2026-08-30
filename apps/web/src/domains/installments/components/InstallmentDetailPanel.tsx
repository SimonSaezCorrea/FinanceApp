import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";
import { Check, Clock, Info, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { SidePanel } from "../../../shared/ui/overlay";
import {
  billingWarningKey,
  nextDuePayment,
  paidCount,
  paymentStatus,
  progressRatio,
} from "../lib/installmentMetrics";
import { PlanStatusBadge } from "./PlanStatusBadge";

interface InstallmentDetailPanelProps {
  readonly plan: installments.InstallmentPlan | null;
  readonly cardLabel: string | null;
  /** The account behind the plan's card, when it has a CREDIT one — for the
   * "ver facturación" link (FR-020) and the billing-warning remedy (FR-023a). */
  readonly accountId: string | null;
  /** Statement ids known to have settled with a shortfall — an instalment they
   * charged reads "saldada, pago parcial" instead of a flat "pagada" (FR-020). */
  readonly partiallyPaidStatementIds: ReadonlySet<string>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPay: (sequence: number) => void;
  readonly onUnpay: (sequence: number) => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly busySequence: number | null;
}

/**
 * A plan's full calendar, as a side panel over the list.
 *
 * A panel and not a modal because this is working WITH a record: the list behind
 * stays as context, keeps its order and its scroll position, and the long instalment
 * list scrolls in the panel's own body with the pay action pinned at the foot — so it
 * is reachable on instalment 1 and on instalment 60 alike (FR-058c).
 *
 * There is deliberately NO ‹ › navigation between plans (FR-011b): unlike a movement,
 * a plan is consulted one at a time, and that gesture would compete with the scrolling
 * list inside.
 */
export function InstallmentDetailPanel({
  plan,
  cardLabel,
  accountId,
  partiallyPaidStatementIds,
  onOpenChange,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
  busySequence,
}: InstallmentDetailPanelProps) {
  const { t, i18n } = useTranslation();

  if (plan === null) return null;

  const money = (value: string) =>
    formatMoney(value, { locale: i18n.language, currency: plan.currency });
  // FR-021: a credit-card plan's instalments are never individually payable — they
  // settle only when the card's statement is paid. `next` stays null for one, which
  // is what removes both the footer button and every per-row action below.
  const next = plan.generatesMovementOnPay ? nextDuePayment(plan.payments) : null;
  const paid = paidCount(plan);
  const warningKey = billingWarningKey(plan);

  return (
    <SidePanel
      open
      onOpenChange={onOpenChange}
      eyebrow={t("installments.detail.eyebrow")}
      title={plan.title}
      description={[cardLabel, t(`installments.frequency.${plan.frequency}`)]
        .filter(Boolean)
        .join(" · ")}
      footer={
        <div className="flex items-center gap-2">
          {next && (
            <Button
              variant="accent"
              className="flex-1"
              disabled={busySequence !== null}
              onClick={() => onPay(next.sequence)}
            >
              {t("installments.detail.payNext", { sequence: next.sequence })}
            </Button>
          )}
          {/* FR-054a: with nothing left to pay, EDIT is the primary action — a
              disabled pay button pinned to the foot of a phone screen would be a
              dead control in the most prominent place on the panel. */}
          <Button
            variant={next ? "outline" : "accent"}
            className={next ? undefined : "flex-1"}
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {t("common.edit")}
          </Button>
          <Button variant="ghost" aria-label={t("common.delete")} onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-chip text-muted-foreground">
            <CategoryIcon category={plan.category} className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <PlanStatusBadge status={plan.status} nextDueDate={plan.nextDueDate} />
              <span className="text-sm tabular-nums text-muted-foreground">
                {paid}/{plan.installmentCount}
              </span>
            </div>
            <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-track">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.round(progressRatio(plan) * 100)}%` }}
              />
            </span>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Figure
            label={t("installments.detail.paid")}
            value={money(plan.paidTotal)}
            tone="success"
          />
          <Figure label={t("installments.detail.remaining")} value={money(plan.remainingAmount)} />
          <Figure label={t("installments.detail.total")} value={money(plan.totalPrincipal)} />
        </div>

        {/* FR-036: say WHY no movement is recorded, rather than silently not doing it. */}
        {!plan.generatesMovementOnPay && (
          <p className="flex gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t("installments.detail.creditCardNotice")}
          </p>
        )}

        {/* FR-023a: why these instalments can't reach a statement, when something
            blocks them — the account's own page is where the remedy lives. */}
        {warningKey && (
          <p className="flex gap-2 rounded-md bg-warning/10 p-3 text-xs text-warning">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {t(warningKey)}
              {plan.billingWarning === "NO_BILLING_DAY" && accountId && (
                <>
                  {" "}
                  <Link
                    to={`/accounts/${accountId}?tab=billing`}
                    className="underline underline-offset-2"
                  >
                    {t("installments.detail.viewBilling")}
                  </Link>
                </>
              )}
            </span>
          </p>
        )}

        <section className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {t("installments.detail.instalments")}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t("installments.detail.paidOfTotal", {
                paid,
                pending: plan.installmentCount - paid,
              })}
            </span>
          </div>

          <ul className="flex flex-col">
            {[...plan.payments]
              .sort((a, b) => a.sequence - b.sequence)
              .map((payment) => {
                const status = paymentStatus(payment, plan.payments);
                const isNext = next?.id === payment.id;
                return (
                  <li
                    key={payment.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border-b border-border px-2 py-2.5 last:border-b-0",
                      isNext && "bg-accent/5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        status === "paid" && "border-success bg-success/15 text-success",
                        status === "billed" && "border-accent bg-accent/15 text-accent",
                        status !== "paid" && status !== "billed" && "border-border",
                      )}
                      aria-hidden
                    >
                      {status === "paid" && <Check className="h-3 w-3" />}
                      {status === "billed" && <Clock className="h-3 w-3" />}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm text-foreground">
                        {t("installments.detail.instalmentOf", {
                          sequence: payment.sequence,
                          total: plan.installmentCount,
                        })}
                      </span>
                      <span
                        className={cn("text-xs", isNext ? "text-accent" : "text-muted-foreground")}
                      >
                        {new Date(payment.dueDate).toLocaleDateString(i18n.language, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {/* The carry-over is shown APART from the scheduled amount, never
                          folded into it: the schedule never changed (FR-022). */}
                      {payment.carriedOverAmount !== "0.0000" && (
                        <span className="text-xs text-warning">
                          {t("installments.detail.carriedOver", {
                            amount: money(payment.carriedOverAmount),
                          })}
                        </span>
                      )}
                      {status === "partial" && payment.paidAmount !== null && (
                        <span className="text-xs text-warning">
                          {t("installments.detail.paidSoFar", {
                            amount: money(payment.paidAmount),
                          })}
                        </span>
                      )}
                      {/* FR-018: BILLED reads as its own situation — not overdue
                          (nothing is late), not paid (nothing settled yet). */}
                      {status === "billed" && (
                        <span className="text-xs text-accent">
                          {t("installments.paymentStatus.BILLED")}
                        </span>
                      )}
                      {/* FR-020: a period settled with a shortfall says so on the
                          instalment it charged, instead of a flat "pagada". */}
                      {status === "paid" &&
                        payment.creditStatementId !== null &&
                        partiallyPaidStatementIds.has(payment.creditStatementId) && (
                          <span className="text-xs text-warning">
                            {t("installments.settledPartially")}{" "}
                            {accountId && (
                              <Link
                                to={`/accounts/${accountId}?tab=billing&statement=${payment.creditStatementId}`}
                                className="underline underline-offset-2"
                              >
                                {t("installments.detail.viewBilling")}
                              </Link>
                            )}
                          </span>
                        )}
                    </span>

                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      {money(payment.dueAmount)}
                    </span>

                    <span className="w-16 shrink-0 text-right">
                      {/* FR-021/FR-022a: a credit-card plan's instalments are never
                          individually paid OR undone — both settle only when the
                          card's statement is paid. */}
                      {!plan.generatesMovementOnPay ? null : status === "paid" ? (
                        <button
                          type="button"
                          disabled={busySequence !== null}
                          onClick={() => onUnpay(payment.sequence)}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {t("installments.detail.undo")}
                        </button>
                      ) : isNext ? (
                        <button
                          type="button"
                          disabled={busySequence !== null}
                          onClick={() => onPay(payment.sequence)}
                          className="text-xs font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {t("installments.detail.pay")}
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

interface FigureProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: "success" | "default";
}

function Figure({ label, value, tone = "default" }: FigureProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "success" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
