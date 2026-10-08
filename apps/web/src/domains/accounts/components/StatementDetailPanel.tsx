import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract, type accounts } from "@finance/contracts";
import { formatMoney, subtractMoney } from "@finance/money";

import {
  useInfiniteTransactions,
  useTransactionsSummary,
} from "../../transactions/hooks/useTransactions";
import { TransactionTable } from "../../transactions/components/TransactionTable";
import { useInstallments } from "../../installments/hooks/useInstallments";
import { SidePanel } from "../../../shared/ui/overlay";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { CategoryIcon } from "../../reference/components/CategoryIcon";
import { LoadingState } from "../../../shared/ui/states";
import { STATEMENT_STATUS_VARIANT } from "../lib/statementStatus";

interface StatementDetailPanelProps {
  readonly account: accounts.BankAccount;
  readonly statement: accounts.CreditStatement | null;
  readonly onOpenChange: (open: boolean) => void;
  /** Every period of this account — only used to resolve `carriedToId` into a
   * clickable statement, so a shortfall figure can jump to where it landed. */
  readonly statements?: readonly accounts.CreditStatement[];
  readonly onSelectStatement?: (statement: accounts.CreditStatement) => void;
  /** "Editar fechas": moves a generated period's dates, or schedules the open one's. */
  readonly onEditDates?: (statement: accounts.CreditStatement) => void;
}

/**
 * A single billing period, read-only: its own figures plus every movement
 * linked to it — the same information `BillingSection`'s table/cards
 * already show a slice of, but for ONE period at a time and with the
 * movements that make it up, which the row/card never had room for.
 *
 * A panel, not a modal: a period's movement list can run long, and the
 * account's billing table behind it stays visible as context.
 */
export function StatementDetailPanel({
  account,
  statement,
  onOpenChange,
  statements,
  onSelectStatement,
  onEditDates,
}: StatementDetailPanelProps) {
  const { t, i18n } = useTranslation();
  // A period can hold hundreds of movements: they load a page at a time ("Mostrar
  // más"), and the total comes from the API's own count, not from what's loaded.
  const filters = { creditStatementId: statement?.id };
  const enabled = statement !== null;
  const movementsQuery = useInfiniteTransactions(filters, { enabled });
  const { data: summary } = useTransactionsSummary(filters, { enabled });
  const movements = useMemo(
    () => movementsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [movementsQuery.data],
  );
  const { isLoading } = movementsQuery;
  // A CREDIT-card plan's instalments never create a `Transaction` row (FR-011):
  // what a period actually owes is real purchases PLUS whatever the schedule
  // billed into it, so the movements list alone never adds up to `amount`. The
  // billed instalments themselves live on `installment-plan`, not `transaction`
  // — same two disjoint sources the statement's own `breakdown` composes from.
  const { data: plans } = useInstallments();
  const billedInstalments = useMemo(() => {
    if (!statement || !plans) return [];
    return plans.flatMap((plan) =>
      plan.payments
        .filter((p) => p.creditStatementId === statement.id)
        .map((payment) => ({ plan, payment })),
    );
  }, [plans, statement]);

  if (statement === null) return null;

  // Spec 028: in the statement's OWN currency (a USD period shows dollars).
  const fmt = (v: string) =>
    formatMoney(v, { locale: i18n.language, currency: statement.currency });
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  // Paid or transferred (spec 028) — both are final.
  const isSettled = accountsContract.isSettled(statement);
  // `remainingAmount` is always "0" once settled BY DESIGN — a shortfall isn't
  // owed on THIS period any more, it rolled into the next one. Showing that "0"
  // as a bare "Restante" reads as a contradiction next to "Pagado" being less
  // than "Monto", so a settled period shows where the difference actually went
  // instead of repeating the same zero the badge already implies.
  // Only a PAYMENT can fall short; a transferred period's debt went elsewhere whole.
  const shortfall = statement.paidAt ? subtractMoney(statement.amount, statement.paidAmount) : "0";
  const carriedTo =
    statement.carriedToId && statements
      ? statements.find((s) => s.id === statement.carriedToId)
      : undefined;

  return (
    <SidePanel
      open
      onOpenChange={onOpenChange}
      eyebrow={t("accounts.detail.billingTitle")}
      title={
        statement.closedAt
          ? `${date(statement.periodStart)} – ${date(statement.closedAt)}`
          : statement.nextClosingDate
            ? `${date(statement.periodStart)} – ${date(statement.nextClosingDate)}`
            : t("accounts.detail.billingPeriodToDate", { date: date(statement.periodStart) })
      }
      description={account.name}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant={STATEMENT_STATUS_VARIANT[statement.status]}>
            {t(`accounts.detail.billingStatusValue.${statement.status}`)}
          </Badge>
          {isSettled && statement.paidAt ? (
            <span className="text-sm text-muted-foreground">
              {t("accounts.detail.billingPaidOn", { date: date(statement.paidAt) })}
            </span>
          ) : !isSettled && statement.dueDate ? (
            <span className="text-sm text-muted-foreground">
              {t("accounts.detail.billingDueDate", { date: date(statement.dueDate) })}
            </span>
          ) : null}
        </div>

        {statement.closedAt && onEditDates ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onEditDates(statement)}
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            {t("accounts.generate.editTitle")}
          </Button>
        ) : !statement.closedAt && onEditDates ? (
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => onEditDates(statement)}
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              {t("accounts.generate.editTitle")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("accounts.generate.openHint")}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Figure label={t("accounts.detail.billingAmount")} value={fmt(statement.amount)} />
          <Figure
            label={t("accounts.detail.statementPaid")}
            value={fmt(statement.paidAmount)}
            tone="success"
          />
          {isSettled && Number(shortfall) > 0 ? (
            <Figure
              label={t("accounts.detail.payRemainingAfter")}
              value={fmt(shortfall)}
              tone="warning"
              onClick={carriedTo ? () => onSelectStatement?.(carriedTo) : undefined}
            />
          ) : (
            <Figure
              label={t("accounts.detail.statementRemaining")}
              value={fmt(statement.remainingAmount)}
            />
          )}
        </div>

        {Number(statement.carriedOverAmount) > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("accounts.detail.billingIncludesCarryOver", {
              amount: fmt(statement.carriedOverAmount),
            })}
          </p>
        ) : null}

        {Number(statement.breakdown.installmentCount) > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("accounts.detail.billingBreakdown", {
              purchases: fmt(statement.breakdown.purchases),
              installments: fmt(statement.breakdown.installments),
              count: statement.breakdown.installmentCount,
            })}
          </p>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {billedInstalments.length > 0
              ? t("accounts.detail.statementPurchases")
              : t("transactions.title")}
          </h3>
          {isLoading ? (
            <LoadingState title={t("app.loading")} />
          ) : (
            <>
              <TransactionTable
                transactions={movements}
                accounts={[account]}
                showAccountColumn={false}
              />
              {movementsQuery.hasNextPage ? (
                <div className="flex flex-col items-center gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={movementsQuery.isFetchingNextPage}
                    onClick={() => void movementsQuery.fetchNextPage()}
                  >
                    {movementsQuery.isFetchingNextPage
                      ? t("app.loading")
                      : t("accounts.detail.statementShowMore")}
                  </Button>
                  {summary ? (
                    <span className="text-xs text-muted-foreground">
                      {t("accounts.detail.statementShown", {
                        shown: movements.length,
                        total: summary.total,
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* Spec 014: a CREDIT plan's due instalments never become movements —
            shown here so the period's total is traceable, not just its label. */}
        {billedInstalments.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {t("accounts.detail.statementInstallments")}
            </h3>
            <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
              {billedInstalments.map(({ plan, payment }) => (
                <li key={payment.id} className="flex items-center gap-3 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chip text-muted-foreground">
                    <CategoryIcon categoryId={plan.categoryId} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{plan.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("installments.detail.instalmentOf", {
                        sequence: payment.sequence,
                        total: plan.installmentCount,
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {formatMoney(payment.dueAmount, {
                      locale: i18n.language,
                      currency: plan.currency,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </SidePanel>
  );
}

interface FigureProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: "success" | "warning" | "default";
  /** Set only when there's somewhere to jump to (the period it carried into) —
   * turns the tile into a real control instead of a dead-looking one. */
  readonly onClick?: () => void;
}

function Figure({ label, value, tone = "default", onClick }: FigureProps) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  const content = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col gap-0.5 rounded-md border bg-card p-3 text-left hover:bg-muted/40"
      >
        {content}
      </button>
    );
  }
  return <div className="flex flex-col gap-0.5 rounded-md border bg-card p-3">{content}</div>;
}
