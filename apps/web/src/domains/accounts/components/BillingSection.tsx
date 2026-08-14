import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { useAccountMutations, useCreditStatements } from "../hooks/useAccounts";
import { EditStatementPaymentPanel } from "./EditStatementPaymentPanel";
import { PayStatementPanel } from "./PayStatementPanel";

const STATUS_VARIANT = {
  OPEN: "info",
  PENDING: "warning",
  // Settled, but not for its full amount — success would overstate it.
  PARTIALLY_PAID: "warning",
  PAID: "success",
} as const;

/**
 * Where the periods table gives way to the stacked layout. Measured on the
 * SECTION, not the viewport: the collapsible sidebar changes how much room this
 * has at the same screen width (see the container-width rule in CLAUDE.md). Five
 * columns need this much before they stop colliding — less than it used to, now
 * that the actions column is one icon plus, at most, one button.
 */
const BILLING_TABLE_MIN_WIDTH = 640;

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
      <Table>
        <THead>
          <TR>
            <TH>{t("accounts.detail.billingPeriod")}</TH>
            <TH numeric>{t("accounts.detail.billingAmount")}</TH>
            <TH>{t("accounts.detail.billingStatus")}</TH>
            <TH>{t("accounts.detail.billingPaidAt")}</TH>
            <TH>{t("accounts.detail.billingActions")}</TH>
          </TR>
        </THead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <TR key={i}>
              <TD>
                <Skeleton className="h-[13px] w-24" />
              </TD>
              <TD numeric>
                <Skeleton className="ml-auto h-[13px] w-24" />
              </TD>
              <TD>
                <Skeleton className="h-[20px] w-20 rounded-full" />
              </TD>
              <TD>
                <Skeleton className="h-[13px] w-20" />
              </TD>
              <TD>
                <Skeleton className="h-8 w-8 rounded-md" />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </SkeletonScreen>
  );
}

export function BillingSection({
  account,
  hideTitle,
}: {
  account: accounts.BankAccount;
  /** The tab strip above already names this section — don't repeat it. */
  hideTitle?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { data: statements, isLoading, isError } = useCreditStatements(account.id);
  const { generateStatements, syncStatement } = useAccountMutations();
  const [payTarget, setPayTarget] = useState<accounts.CreditStatement | null>(null);
  const [syncTarget, setSyncTarget] = useState<accounts.CreditStatement | null>(null);
  const [editPaymentTarget, setEditPaymentTarget] = useState<accounts.CreditStatement | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const [containerRef, width] = useElementWidth();
  // Until measured, the stacked layout: it works at every width, so guessing it
  // is a cosmetic downgrade rather than a table overflowing its column.
  const wide = width !== null && width >= BILLING_TABLE_MIN_WIDTH;

  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  // Settled = `paidAt`, not `status === "PAID"`: a period paid for less than its
  // total reports PARTIALLY_PAID and is just as closed (its shortfall is owed in
  // the next period, not here), so it belongs with the history, not the actionable
  // ones. `isSettled` is also what hides the "Pagar" action.
  const isSettled = (s: accounts.CreditStatement) => s.paidAt !== null;
  const open = statements?.filter((s) => !isSettled(s)) ?? [];
  const paid = statements?.filter(isSettled) ?? [];

  /** The period being accumulated/owed: the protagonist of the stacked layout. */
  function CurrentPeriodCard({ statement: s }: Readonly<{ statement: accounts.CreditStatement }>) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface2 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {s.closedAt
              ? `${date(s.periodStart)} – ${date(s.closedAt)}`
              : t("accounts.detail.billingPeriodToDate", { date: date(s.periodStart) })}
          </span>
          <Badge variant={STATUS_VARIANT[s.status]}>
            {t(`accounts.detail.billingStatusValue.${s.status}`)}
          </Badge>
        </div>

        <p className="text-3xl font-semibold tabular-nums">{fmt(s.amount)}</p>
        {Number(s.carriedOverAmount) > 0 ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("accounts.detail.billingIncludesCarryOver", { amount: fmt(s.carriedOverAmount) })}
          </p>
        ) : null}

        {/* Same order as the table: sync first, pay after. */}
        <div className="flex items-center gap-2">
          <SyncButton statement={s} iconOnly size="md" />
          <Button variant="secondary" className="flex-1" onClick={() => setPayTarget(s)}>
            {t("accounts.actions.payCredit")}
          </Button>
        </div>
      </div>
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
        variant="outline"
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
          disabled={generateStatements.isPending}
          // Closing a billing period is not reversible from the UI: it turns the
          // open period into one pending payment. Ask first.
          onClick={() => setConfirmGenerate(true)}
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
        ) : isError ? (
          <ErrorState title={t("errors.INTERNAL_ERROR")} />
        ) : !statements || statements.length === 0 ? (
          <EmptyState title={t("accounts.detail.billingEmpty")} />
        ) : !wide ? (
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
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                  >
                    <div className="min-w-0">
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
                          {t("accounts.detail.billingPaidAmount", { amount: fmt(s.paidAmount) })}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums">{fmt(s.amount)}</span>
                      <SyncButton statement={s} iconOnly />
                      {s.status === "PARTIALLY_PAID" ? (
                        <Button variant="outline" size="sm" onClick={() => setEditPaymentTarget(s)}>
                          {t("accounts.actions.editStatementPaymentShort")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("accounts.detail.billingPeriod")}</TH>
                <TH numeric>{t("accounts.detail.billingAmount")}</TH>
                <TH>{t("accounts.detail.billingStatus")}</TH>
                <TH>{t("accounts.detail.billingPaidAt")}</TH>
                <TH>{t("accounts.detail.billingActions")}</TH>
              </TR>
            </THead>
            <tbody>
              {statements.map((s) => (
                <TR key={s.id}>
                  <TD>{new Date(s.periodStart).toLocaleDateString(i18n.language)}</TD>
                  <TD numeric>
                    {fmt(s.amount)}
                    {/* Only what this period INHERITED: its figure is no longer
                        just its own movements. What it rolled over is deliberately
                        not repeated here — it is the same money, already shown as
                        "incluye …" on the period that now owes it. */}
                    {Number(s.carriedOverAmount) > 0 ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t("accounts.detail.billingIncludesCarryOver", {
                          amount: fmt(s.carriedOverAmount),
                        })}
                      </span>
                    ) : null}
                    {/* Muted, not coloured: the badge beside it already carries the
                        colour, and two warning-toned things in one row read as an
                        error. Only the covered figure — the total is right above. */}
                    {s.status === "PARTIALLY_PAID" ? (
                      <span className="block text-xs font-normal tabular-nums text-muted-foreground">
                        {t("accounts.detail.billingPaidAmount", { amount: fmt(s.paidAmount) })}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    {/* `nowrap`: "Pago parcial" wrapped to two lines and made the
                        row taller than every other one. */}
                    <Badge variant={STATUS_VARIANT[s.status]} className="whitespace-nowrap">
                      {t(`accounts.detail.billingStatusValue.${s.status}`)}
                    </Badge>
                  </TD>
                  <TD>{s.paidAt ? new Date(s.paidAt).toLocaleDateString(i18n.language) : "—"}</TD>
                  <TD>
                    {/* Sync is the ICON alone: repeating "Sincronizar pagos" down
                        every row made a column of text wider than the data it acts
                        on, and left the one row with a real decision looking like
                        the rest. Sync FIRST and LEFT-aligned (not `justify-end`),
                        so its button sits at the same x in every row instead of
                        sliding sideways depending on what follows it. */}
                    <div className="flex items-center gap-2">
                      <SyncButton statement={s} iconOnly />
                      {isSettled(s) ? (
                        // A period settled for less than its total: the payment is
                        // the only correctable figure (its amount comes from the
                        // movements, via sync).
                        s.status === "PARTIALLY_PAID" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditPaymentTarget(s)}
                          >
                            {t("accounts.actions.editStatementPayment")}
                          </Button>
                        ) : null
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => setPayTarget(s)}>
                          {t("accounts.actions.payCredit")}
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <ConfirmModal
        open={confirmGenerate}
        onOpenChange={setConfirmGenerate}
        title={t("accounts.actions.generateStatementsConfirm")}
        description={t("accounts.actions.generateStatementsConfirmDescription")}
        confirmLabel={t("accounts.actions.generateStatements")}
        loading={generateStatements.isPending}
        onConfirm={() =>
          generateStatements.mutate(account.id, {
            onSuccess: () => {
              toast.success(t("accounts.actions.generateStatementsSuccess"));
              setConfirmGenerate(false);
            },
            onError: () => toast.error(t("errors.INTERNAL_ERROR")),
          })
        }
      />

      <EditStatementPaymentPanel
        account={account}
        statement={editPaymentTarget}
        onOpenChange={(v) => !v && setEditPaymentTarget(null)}
      />
      <PayStatementPanel
        account={account}
        statement={payTarget}
        onOpenChange={(v) => !v && setPayTarget(null)}
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
