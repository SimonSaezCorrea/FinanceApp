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
import { useAccountMutations, useCreditStatements } from "../hooks/useAccounts";
import { PayStatementPanel } from "./PayStatementPanel";

const STATUS_VARIANT = {
  OPEN: "info",
  PENDING: "warning",
  PARTIALLY_PAID: "info",
  PAID: "success",
} as const;

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
                <Skeleton className="h-8 w-24 rounded-md" />
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
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });

  return (
    <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 xl:shrink-0">
        {hideTitle ? null : (
          <h2 className="text-lg font-semibold">{t("accounts.detail.billingTitle")}</h2>
        )}
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
                  <TD numeric>{fmt(s.amount)}</TD>
                  <TD>
                    <Badge variant={STATUS_VARIANT[s.status]}>
                      {t(`accounts.detail.billingStatusValue.${s.status}`)}
                    </Badge>
                  </TD>
                  <TD>{s.paidAt ? new Date(s.paidAt).toLocaleDateString(i18n.language) : "—"}</TD>
                  <TD>
                    {/* Sync FIRST: it's the only action every row has, so leading
                        with it keeps that button in one column down the table.
                        "Pagar" then sits to its right on the rows that offer it,
                        instead of shunting the sync button sideways. */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={syncStatement.isPending}
                        onClick={() => setSyncTarget(s)}
                      >
                        <RefreshCw
                          className={cn("h-3.5 w-3.5", syncStatement.isPending && "animate-spin")}
                          aria-hidden
                        />
                        {t("accounts.actions.syncStatement")}
                      </Button>
                      {s.status === "PAID" ? null : (
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
