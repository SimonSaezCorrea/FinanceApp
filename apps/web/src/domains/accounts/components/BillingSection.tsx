import { useEffect, useState } from "react";
import { Banknote, CalendarDays, CreditCard, Inbox, Pencil, RefreshCw } from "lucide-react";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { accounts as accountsContract, type accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "@finance/ui/src/shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { ErrorState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { TABLE_ROW_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { TransactionCreateModal } from "../../transactions/components/TransactionCreateModal";
import { useAccountMutations, useCreditStatements } from "../hooks/useAccounts";
import { EditStatementPaymentPanel } from "./EditStatementPaymentPanel";
import { GenerateStatementPanel } from "./GenerateStatementPanel";
import { PayStatementPanel } from "./PayStatementPanel";
import { StatementDetailPanel } from "./StatementDetailPanel";
import { STATEMENT_STATUS_VARIANT, statementsByCurrency } from "../lib/statementStatus";

/** "Facturación" tab: every billing period for this account's credit pool — open
 * (still accumulating), pending (closed, awaiting payment) or paid — with actions
 * to pay (choosing a source bank account) or correct a paid one's frozen amount. */
/**
 * Loading shape of the periods table. The column headings are ours — they never
 * depend on the response — so they render for real and the table is already
 * itself before a single row arrives; only the cells are placeholders.
 */
function BillingTableSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();
  return (
    <SkeletonScreen label={label}>
      <Card className="overflow-hidden p-0">
        <Table>
          <THead className="bg-muted/50">
            <TR>
              <TH className="w-8 pr-0" />
              <TH className="whitespace-nowrap">{t("accounts.detail.billingPeriod")}</TH>
              <TH className="whitespace-nowrap">{t("accounts.detail.billingPayment")}</TH>
              <TH className="whitespace-nowrap">{t("accounts.detail.billingStatus")}</TH>
              <TH numeric className="whitespace-nowrap">
                {t("accounts.detail.billingAmount")}
              </TH>
              <TH className="w-px">
                <span className="sr-only">{t("accounts.detail.billingActions")}</span>
              </TH>
            </TR>
          </THead>
          <tbody>
            {[0, 1, 2].map((i) => (
              <TR key={i}>
                <TD className="pr-0">
                  <Skeleton className="h-8 w-8 rounded-full" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-36" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-20" />
                </TD>
                <TD>
                  <Skeleton className="h-[20px] w-20 rounded-full" />
                </TD>
                <TD numeric>
                  <Skeleton className="ml-auto h-[13px] w-24" />
                </TD>
                <TD>
                  <Skeleton className="ml-auto h-8 w-24 rounded-md" />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </SkeletonScreen>
  );
}

/** The message that occupies the periods table/list while there's no billing
 * history yet — OR, when the load itself failed, the error instead (same
 * spot, `ErrorState`'s own `inline` look). No border of its own — the
 * surrounding `Card` and header row (wide layout) are already the frame,
 * same convention `TransactionTable`'s own `EmptyRow` and Cuotas'
 * `PlanEmptyRow` use, so the table's chrome (headers, "Generar
 * facturación") stays on screen instead of the whole section swapping out
 * for a lone floating message. */
function BillingEmptyMessage({
  error,
  onRetry,
}: Readonly<{ error?: unknown; onRetry?: () => void }>) {
  const { t } = useTranslation();
  if (error) return <ErrorState inline error={error} onRetry={onRetry} />;
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{t("accounts.detail.billingEmpty")}</p>
    </div>
  );
}

export function BillingSection({
  account,
  hideTitle,
  openStatementId,
  onConsumeOpenStatement,
}: {
  account: accounts.BankAccount;
  /** The tab strip above already names this section — don't repeat it. */
  hideTitle?: boolean;
  /** Deep-linked from elsewhere (e.g. an instalment's "ver facturación"): once
   * the periods load, the matching one opens its own detail automatically. */
  openStatementId?: string | null;
  /** Called once the deep link above has been acted on, so the URL doesn't
   * keep re-opening the same period on every re-render/back navigation. */
  onConsumeOpenStatement?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const {
    data: rawStatements,
    isLoading,
    isError,
    error,
    refetch,
  } = useCreditStatements(account.id);
  // `rawStatements` is whatever the query last fetched SUCCESSFULLY —
  // react-query keeps it around across a failed refetch, so a connection drop
  // after the periods already loaded once would otherwise render those STALE
  // rows as if the load had succeeded, hiding the error and its retry action
  // entirely. Treat it as empty whenever the CURRENT state is an error.
  const statements = isError ? undefined : rawStatements;
  const { syncStatement } = useAccountMutations();
  const [payTarget, setPayTarget] = useState<accounts.CreditStatement | null>(null);
  // Spec 019: the OPEN period is never "paid" from here anymore — `payTowards`
  // would liquidate/close it, which is not what abonar early means. It opens
  // the ordinary movement form straight into "Prepagar" instead.
  const [prepayOpen, setPrepayOpen] = useState(false);
  // Spec 030: the OPEN period of another currency is prepaid in the payment panel.
  const [prepayTarget, setPrepayTarget] = useState<accounts.CreditStatement | null>(null);
  const [syncTarget, setSyncTarget] = useState<accounts.CreditStatement | null>(null);
  const [editPaymentTarget, setEditPaymentTarget] = useState<accounts.CreditStatement | null>(null);
  const [detailTarget, setDetailTarget] = useState<accounts.CreditStatement | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editDatesTarget, setEditDatesTarget] = useState<accounts.CreditStatement | null>(null);
  // Spec 028: which currency's periods are on screen — one window-style tab per
  // currency. `null` = the account's own (the first tab).
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!openStatementId || !statements) return;
    const match = statements.find((s) => s.id === openStatementId);
    if (match) {
      setDetailTarget(match);
      // A deep link to a USD period lands on the USD tab, not behind the CLP one.
      setSelectedCurrency(match.currency);
    }
    onConsumeOpenStatement?.();
    // Only once the periods for THIS deep link have arrived — re-running on
    // every `statements` refetch would reopen a panel the user already closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStatementId, statements]);

  const [containerRef, width] = useElementWidth();
  // Until measured, the stacked layout: it works at every width, so guessing it
  // is a cosmetic downgrade rather than a table overflowing its column.
  const wide = width !== null && width >= TABLE_ROW_MIN_WIDTH;

  // Spec 028: every figure in the statement's OWN currency — a USD period's amounts
  // are dollars, never pesos, and are never converted or summed with the CLP ones.
  const fmt = (v: string, currency: string = account.currency) =>
    formatMoney(v, { locale: i18n.language, currency });
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  /** "3 ago 2026" — easier to scan down a column than "3/8/2026". */
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  /** "23 jun – 22 jul 2026": the year only once when both ends share it. */
  const range = (fromIso: string, toIso: string) => {
    const from = new Date(fromIso);
    const sameYear = from.getFullYear() === new Date(toIso).getFullYear();
    const start = from.toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    return `${start} – ${shortDate(toIso)}`;
  };

  /** "start – end": the real close for a settled period, the PROJECTED close
   * (the account's billing-day boundary) for an open one — never "hasta hoy",
   * which said nothing about when it will actually close. Falls back to that
   * only when the account has no billing day configured at all, i.e. there's
   * genuinely no deadline to show. */
  const periodLabel = (s: accounts.CreditStatement) => {
    if (s.closedAt) return range(s.periodStart, s.closedAt);
    if (s.nextClosingDate) return range(s.periodStart, s.nextClosingDate);
    return t("accounts.detail.billingPeriodToDate", { date: shortDate(s.periodStart) });
  };

  // Settled = paid OR transferred (`accounts.isSettled`), never `status === "PAID"`:
  // a period paid for less than its total reports PARTIALLY_PAID and one the bank
  // converted reports TRANSFERRED, and both are just as closed, so they belong with
  // the history, not the actionable ones. It is also what hides the "Pagar" action.
  const isSettled = accountsContract.isSettled;
  const isForeign = (s: accounts.CreditStatement) => s.currency !== account.currency;
  // One row per "Generar facturación", newest first — with the OPEN period (what
  // isn't billed yet) on top as its own "Abierta" row, so a pending statement and
  // the period still accumulating read side by side.
  const ordered = [...(statements ?? [])].sort((a, b) => {
    if (!a.closedAt || !b.closedAt) return a.closedAt ? 1 : b.closedAt ? -1 : 0;
    return new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime();
  });
  const groups = statementsByCurrency(ordered, account.currency);
  // A currency that vanished (its last period deleted) falls back to the first tab.
  const activeGroup = groups.find((g) => g.currency === selectedCurrency) ?? groups[0] ?? null;

  /** The period being accumulated/owed: the protagonist of the stacked layout. */
  function CurrentPeriodCard({ statement: s }: Readonly<{ statement: accounts.CreditStatement }>) {
    return (
      <button
        type="button"
        onClick={() => setDetailTarget(s)}
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface2 p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-muted-foreground">{periodLabel(s)}</span>
          <Badge variant={STATEMENT_STATUS_VARIANT[s.status]}>
            {t(`accounts.detail.billingStatusValue.${s.status}`)}
          </Badge>
        </div>

        <p className="text-3xl font-semibold tabular-nums">{fmt(s.amount, s.currency)}</p>
        {!isSettled(s) && s.dueDate ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("accounts.detail.billingDueDate", { date: date(s.dueDate) })}
          </p>
        ) : null}
        {Number(s.carriedOverAmount) > 0 ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("accounts.detail.billingIncludesCarryOver", {
              amount: fmt(s.carriedOverAmount, s.currency),
            })}
          </p>
        ) : null}
        {/* Spec 014, FR-011: purchases and instalments come from two disjoint
            sources now — real figures, not the "0" this always reported before. */}
        {Number(s.breakdown.installmentCount) > 0 ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("accounts.detail.billingBreakdown", {
              purchases: fmt(s.breakdown.purchases, s.currency),
              installments: fmt(s.breakdown.installments, s.currency),
              count: s.breakdown.installmentCount,
            })}
          </p>
        ) : null}

        {/* Same order as the table: sync first, pay after. Both stop the click
            from also opening the detail panel underneath them. */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <SyncButton statement={s} iconOnly size="md" />
          <EditDatesButton statement={s} size="md" />
          <PeriodAction statement={s} variant="card" />
        </div>
      </button>
    );
  }

  /** Sync is the one action every period has, in either layout. */
  function SyncButton({
    statement: s,
    iconOnly = false,
    size = "sm",
  }: Readonly<{
    statement: accounts.CreditStatement;
    /** Square, label in `aria-label` only — there is no room for it in a row. */
    iconOnly?: boolean;
    size?: "sm" | "md";
  }>) {
    return (
      <Button
        // `ghost`, not `outline`: Movimientos/Cuotas's own row actions (Editar,
        // Eliminar) are invisible until hovered — an always-bordered chip here
        // stood out as its own style next to them.
        variant="ghost"
        size={size}
        // No `icon` size in the primitive: squaring it here keeps the shared
        // Button honest instead of growing a variant for one screen.
        className={cn(iconOnly && "px-0", iconOnly && (size === "md" ? "w-10" : "w-8"))}
        disabled={syncStatement.isPending}
        onClick={() => setSyncTarget(s)}
        aria-label={iconOnly ? t("accounts.actions.syncStatement") : undefined}
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5", syncStatement.isPending && "animate-spin")}
          aria-hidden
        />
        {iconOnly ? null : t("accounts.actions.syncStatement")}
      </Button>
    );
  }

  /** An empty action, so each icon keeps its column in every row. */
  function ActionSlot({ size = "sm" }: Readonly<{ size?: "sm" | "md" }>) {
    return <span aria-hidden className={cn("shrink-0", size === "md" ? "w-10" : "w-8")} />;
  }

  /** "Editar fechas": on a generated period it moves its real dates; on the open one
   * it only schedules them (nothing closes until that day, or "Generar facturación"). */
  function EditDatesButton({
    statement: s,
    size = "sm",
  }: Readonly<{ statement: accounts.CreditStatement; size?: "sm" | "md" }>) {
    const label = t("accounts.generate.editTitle");
    return (
      <Button
        variant="ghost"
        size={size}
        className={cn("px-0", size === "md" ? "w-10" : "w-8")}
        onClick={() => setEditDatesTarget(s)}
        aria-label={label}
        title={label}
      >
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
      </Button>
    );
  }

  /**
   * The one money action a period offers, decided in ONE place for both layouts:
   * - settled short (PARTIALLY_PAID): correct the payment;
   * - OPEN in the account's currency: prepagar (spec 019 — paying would close it);
   * - PENDING: pay;
   * - OPEN in another currency (spec 030): prepagar, in the payment panel itself — the
   *   transaction form is bound to the credit account's own currency;
   * - transferring an overdue period to pesos arrives with spec 028's US3.
   */
  function PeriodAction({
    statement: s,
    variant,
  }: Readonly<{ statement: accounts.CreditStatement; variant: "card" | "row" }>) {
    const none = variant === "row" ? <ActionSlot /> : null;
    let action: {
      label: string;
      icon: typeof Banknote;
      onClick: () => void;
      tone: "accent" | "ghost";
    };
    if (isSettled(s)) {
      if (s.status !== "PARTIALLY_PAID") return none;
      action = {
        label: t("accounts.actions.editStatementPayment"),
        icon: Pencil,
        onClick: () => setEditPaymentTarget(s),
        tone: "ghost",
      };
    } else if (s.status === "OPEN") {
      action = {
        label: t("transactions.type.PREPAY"),
        icon: Banknote,
        // Another currency has its own panel (two amounts); the account's own keeps the form.
        onClick: () => (isForeign(s) ? setPrepayTarget(s) : setPrepayOpen(true)),
        tone: "accent",
      };
    } else {
      action = {
        label: t("accounts.actions.payCredit"),
        icon: Banknote,
        onClick: () => setPayTarget(s),
        tone: "accent",
      };
    }
    if (variant === "card") {
      return (
        <Button variant="secondary" className="flex-1" onClick={action.onClick}>
          {action.label}
        </Button>
      );
    }
    const Icon = action.icon;
    return (
      // Tinted (not a plain ghost icon) when it moves money forward, same
      // reasoning as the accent "Nuevo" buttons elsewhere.
      <Button
        variant={action.tone}
        size="sm"
        className="w-8 px-0"
        aria-label={action.label}
        title={action.label}
        onClick={action.onClick}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </Button>
    );
  }

  /** Stacked layout of one currency's periods: the unsettled ones as cards, the
   * settled ones as a compact history list. */
  function PeriodsStack({ list }: Readonly<{ list: accounts.CreditStatement[] }>) {
    const open = list.filter((s) => !isSettled(s));
    const paid = list.filter(isSettled);
    return (
      <div className="flex flex-col gap-5">
        {open.map((s) => (
          <CurrentPeriodCard key={s.id} statement={s} />
        ))}

        {paid.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("accounts.detail.billingPaidPeriods")}
            </h3>
            {paid.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setDetailTarget(s)}
                className="flex w-full items-center gap-3 border-b border-border py-3 text-left last:border-0"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
                  <CreditCard className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{date(s.periodStart)}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.paidAt
                      ? t("accounts.detail.billingPaidOn", { date: date(s.paidAt) })
                      : t(`accounts.detail.billingStatusValue.${s.status}`)}
                  </p>
                  {/* Only when the payment fell short: on a fully paid period
                      "pagado X de X" says nothing the amount doesn't. */}
                  {s.status === "PARTIALLY_PAID" ? (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {t("accounts.detail.billingPaidAmount", {
                        amount: fmt(s.paidAmount, s.currency),
                      })}
                    </p>
                  ) : null}
                </div>
                <div
                  className="flex shrink-0 items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-semibold tabular-nums">{fmt(s.amount, s.currency)}</span>
                  <SyncButton statement={s} iconOnly />
                  <EditDatesButton statement={s} />
                  <PeriodAction statement={s} variant="row" />
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  /** Wide layout of one currency's periods. */
  /** "Pago" column: when an unsettled statement is due (red once past), or when a
   * settled one was paid. */
  function PaymentDate({ statement: s }: Readonly<{ statement: accounts.CreditStatement }>) {
    if (s.paidAt) {
      return (
        <div className="leading-tight">
          <p className="tabular-nums">{shortDate(s.paidAt)}</p>
          <p className="text-xs text-muted-foreground">{t("accounts.detail.billingPaidLabel")}</p>
        </div>
      );
    }
    if (!s.closedAt) {
      return <span className="text-muted-foreground">{t("accounts.generate.unbilled")}</span>;
    }
    if (isSettled(s) || !s.dueDate) return <span className="text-muted-foreground">—</span>;
    const overdue = new Date(s.dueDate).getTime() < Date.now();
    return (
      <div className="leading-tight">
        <p className={cn("tabular-nums", overdue && "text-destructive")}>{shortDate(s.dueDate)}</p>
        <p className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {overdue ? t("accounts.detail.billingOverdue") : t("accounts.detail.billingDueLabel")}
        </p>
      </div>
    );
  }

  function PeriodsTable({ list }: Readonly<{ list: accounts.CreditStatement[] }>) {
    return (
      // Same `Card` surface every other table wraps itself in — bare
      // `Table` has no background/border of its own.
      <Card className="overflow-hidden p-0">
        <Table>
          <THead className="bg-muted/50">
            <TR>
              <TH className="w-8 pr-0" />
              <TH className="whitespace-nowrap">{t("accounts.detail.billingPeriod")}</TH>
              <TH className="whitespace-nowrap">{t("accounts.detail.billingPayment")}</TH>
              <TH className="whitespace-nowrap">{t("accounts.detail.billingStatus")}</TH>
              <TH numeric className="whitespace-nowrap">
                {t("accounts.detail.billingAmount")}
              </TH>
              <TH className="w-px">
                <span className="sr-only">{t("accounts.detail.billingActions")}</span>
              </TH>
            </TR>
          </THead>
          <tbody>
            {list.map((s) => (
              <TR
                key={s.id}
                onClick={() => setDetailTarget(s)}
                className="cursor-pointer hover:bg-muted/30"
              >
                <TD className="pr-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-muted-foreground">
                    <CreditCard className="h-4 w-4" aria-hidden />
                  </span>
                </TD>
                {/* `w-full max-w-0` + a truncating child: same fix
                    `TransactionTable` needed for Descripción — the only
                    column with no fixed-content minimum of its own, so
                    without this the table grows past its container
                    instead of wrapping/truncating within it. */}
                <TD className="w-full max-w-0">
                  <div className="truncate font-medium">{periodLabel(s)}</div>
                </TD>
                <TD className="whitespace-nowrap">
                  <PaymentDate statement={s} />
                </TD>
                <TD>
                  {/* `nowrap`: "Pago parcial" wrapped to two lines and made the
                      row taller than every other one. */}
                  <Badge variant={STATEMENT_STATUS_VARIANT[s.status]} className="whitespace-nowrap">
                    {t(`accounts.detail.billingStatusValue.${s.status}`)}
                  </Badge>
                </TD>
                <TD numeric className="max-w-[11rem] whitespace-nowrap font-semibold">
                  {fmt(s.amount, s.currency)}
                  {/* Only what this period INHERITED: its figure is no longer
                      just its own movements. What it rolled over is deliberately
                      not repeated here — it is the same money, already shown as
                      "incluye …" on the period that now owes it. */}
                  {Number(s.carriedOverAmount) > 0 ? (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {t("accounts.detail.billingIncludesCarryOver", {
                        amount: fmt(s.carriedOverAmount, s.currency),
                      })}
                    </span>
                  ) : null}
                  {/* Muted, not coloured: the badge beside it already carries the
                      colour, and two warning-toned things in one row read as an
                      error. Only the covered figure — the total is right above. */}
                  {s.status === "PARTIALLY_PAID" ? (
                    <span className="block truncate text-xs font-normal tabular-nums text-muted-foreground">
                      {t("accounts.detail.billingPaidAmount", {
                        amount: fmt(s.paidAmount, s.currency),
                      })}
                    </span>
                  ) : null}
                </TD>
                <TD className="pl-2">
                  {/* Right-aligned and in a fixed order (sync, dates, money action)
                      so every icon sits at the same x in every row. */}
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SyncButton statement={s} iconOnly />
                    <EditDatesButton statement={s} />
                    <PeriodAction statement={s} variant="row" />
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    );
  }
  return (
    <div ref={containerRef} className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 xl:shrink-0">
        {hideTitle ? null : (
          <h2 className="text-lg font-semibold">{t("accounts.detail.billingTitle")}</h2>
        )}
        {/* Stacked layout: this row doubles as the "current period" heading, so the
            card below it isn't preceded by two competing headers. */}
        {!wide && hideTitle ? (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("accounts.detail.billingCurrentPeriod")}
          </span>
        ) : null}
        <Button
          className="ml-auto"
          size="sm"
          variant="outline"
          // The dates come from the bank's statement: the panel asks for them.
          disabled={!statements}
          onClick={() => setGenerateOpen(true)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {/* Icon-only below 550px: the full label doesn't fit at 320px. */}
          <span className="sr-only sm:not-sr-only">{t("accounts.actions.generateStatements")}</span>
        </Button>
      </div>

      {/* Only the periods table scrolls — heading and actions stay pinned. */}
      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <BillingTableSkeleton label={t("app.loading")} />
        ) : !statements || statements.length === 0 ? (
          wide ? (
            <Card className="overflow-hidden p-0">
              <BillingEmptyMessage error={isError ? error : undefined} onRetry={() => refetch()} />
            </Card>
          ) : (
            <BillingEmptyMessage error={isError ? error : undefined} onRetry={() => refetch()} />
          )
        ) : (
          // Spec 028: one window-style tab per currency — the account's own first —
          // and only the selected currency's periods on screen. Amounts are never
          // converted or summed across tabs. With a single currency there are no
          // tabs at all: the section reads exactly as it always did.
          activeGroup &&
          (groups.length > 1 ? (
            <div className="flex flex-col">
              <div
                role="tablist"
                aria-label={t("accounts.detail.billingCurrencyTabs")}
                className="flex items-end gap-1 border-b"
              >
                {groups.map((group) => {
                  const selected = group.currency === activeGroup.currency;
                  const pending = group.statements.filter((s) => !isSettled(s)).length;
                  return (
                    <button
                      key={group.currency}
                      type="button"
                      role="tab"
                      id={`billing-tab-${group.currency}`}
                      aria-selected={selected}
                      aria-controls={`billing-panel-${group.currency}`}
                      onClick={() => setSelectedCurrency(group.currency)}
                      className={cn(
                        "-mb-px flex shrink-0 items-center gap-2 rounded-t-lg border px-4 py-2 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-b-card bg-card text-foreground"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                    >
                      {group.currency}
                      {pending > 0 ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-xs sm:text-[11px] font-semibold tabular-nums",
                            selected ? "bg-primary/15 text-primary" : "bg-chip",
                          )}
                        >
                          {pending}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <section
                role="tabpanel"
                id={`billing-panel-${activeGroup.currency}`}
                aria-labelledby={`billing-tab-${activeGroup.currency}`}
                className={cn(
                  "flex flex-col gap-3",
                  // Stacked cards float on the page; give them the window's frame.
                  !wide && "rounded-b-xl border border-t-0 bg-card p-3",
                  wide && "[&>*:first-child]:rounded-t-none [&>*:first-child]:border-t-0",
                )}
              >
                {wide ? (
                  <PeriodsTable list={activeGroup.statements} />
                ) : (
                  <PeriodsStack list={activeGroup.statements} />
                )}
              </section>
            </div>
          ) : wide ? (
            <PeriodsTable list={activeGroup.statements} />
          ) : (
            <PeriodsStack list={activeGroup.statements} />
          ))
        )}
      </div>

      {/* Remounted on each open so the dates are proposed afresh from the
          latest close. */}
      {editDatesTarget && statements ? (
        <GenerateStatementPanel
          key={editDatesTarget.id}
          account={account}
          statements={statements}
          statement={editDatesTarget}
          open
          onOpenChange={(v) => !v && setEditDatesTarget(null)}
        />
      ) : null}
      {generateOpen && statements ? (
        <GenerateStatementPanel
          account={account}
          statements={statements}
          open={generateOpen}
          onOpenChange={setGenerateOpen}
        />
      ) : null}

      <StatementDetailPanel
        account={account}
        statement={detailTarget}
        onOpenChange={(v) => !v && setDetailTarget(null)}
        statements={statements}
        onSelectStatement={setDetailTarget}
        onEditDates={(s) => {
          setDetailTarget(null);
          setEditDatesTarget(s);
        }}
      />
      <EditStatementPaymentPanel
        account={account}
        statement={editPaymentTarget}
        onOpenChange={(v) => !v && setEditPaymentTarget(null)}
      />
      <PayStatementPanel
        account={account}
        statement={prepayTarget ?? payTarget}
        intent={prepayTarget ? "prepay" : "pay"}
        onOpenChange={(v) => {
          if (v) return;
          setPayTarget(null);
          setPrepayTarget(null);
        }}
      />
      <TransactionCreateModal
        open={prepayOpen}
        onOpenChange={setPrepayOpen}
        defaultBankAccountId={account.id}
        lockAccount
        initialMode="PREPAY"
      />
      <ConfirmModal
        open={syncTarget !== null}
        onOpenChange={(v) => !v && setSyncTarget(null)}
        title={t("accounts.actions.syncStatementConfirm")}
        description={t("accounts.actions.syncStatementConfirmDescription")}
        confirmLabel={t("accounts.actions.syncStatement")}
        loading={syncStatement.isPending}
        onConfirm={() => {
          if (!syncTarget) return;
          syncStatement.mutate(
            { id: account.id, statementId: syncTarget.id },
            {
              onSuccess: () => {
                toast.success(t("accounts.actions.syncStatementSuccess"));
                setSyncTarget(null);
              },
              onError: () => toast.error(t("errors.INTERNAL_ERROR")),
            },
          );
        }}
      />
    </div>
  );
}
