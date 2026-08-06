import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { useAccountMutations, useAccounts, useCreditStatements } from "../hooks/useAccounts";

const STATUS_VARIANT = {
  OPEN: "info",
  PENDING: "warning",
  PAID: "success",
} as const;

/** "Facturación" tab: every billing period for this account's credit pool — open
 * (still accumulating), pending (closed, awaiting payment) or paid — with actions
 * to pay (choosing a source bank account) or correct a paid one's frozen amount. */
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
  const { generateStatements } = useAccountMutations();
  const [payTarget, setPayTarget] = useState<accounts.CreditStatement | null>(null);
  const [correctTarget, setCorrectTarget] = useState<accounts.CreditStatement | null>(null);

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
          onClick={() =>
            generateStatements.mutate(account.id, {
              onSuccess: () => toast.success(t("accounts.actions.generateStatementsSuccess")),
              onError: () => toast.error(t("errors.INTERNAL_ERROR")),
            })
          }
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {/* Icon-only below 550px: the full label doesn't fit at 320px. */}
          <span className="sr-only sm:not-sr-only">{t("accounts.actions.generateStatements")}</span>
        </Button>
      </div>

      {/* Only the periods table scrolls — heading and actions stay pinned. */}
      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <LoadingState title={t("app.loading")} />
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
                    <div className="flex gap-2">
                      {s.status !== "PAID" ? (
                        <Button variant="secondary" size="sm" onClick={() => setPayTarget(s)}>
                          {t("accounts.actions.payCredit")}
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setCorrectTarget(s)}>
                          {t("accounts.actions.correctAmount")}
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

      <PayStatementModal
        account={account}
        statement={payTarget}
        onOpenChange={(v) => !v && setPayTarget(null)}
      />
      <CorrectAmountModal
        account={account}
        statement={correctTarget}
        onOpenChange={(v) => !v && setCorrectTarget(null)}
      />
    </div>
  );
}

/** Pay a statement by choosing a source bank account (any of the user's own,
 * except CREDIT_LINE — you don't pay a credit card with another credit line). */
function PayStatementModal({
  account,
  statement,
  onOpenChange,
}: {
  account: accounts.BankAccount;
  statement: accounts.CreditStatement | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: allAccounts } = useAccounts();
  const { payCreditStatement } = useAccountMutations();
  const [fromAccountId, setFromAccountId] = useState("");

  const options = (allAccounts ?? [])
    .filter((a) => a.type !== "CREDIT_LINE" && a.status === "ACTIVE")
    .map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }));

  if (!statement) return null;

  return (
    <ResponsiveSurface
      open={statement !== null}
      onOpenChange={onOpenChange}
      title={t("accounts.actions.payCredit")}
      description={formatMoney(statement.amount, {
        locale: i18n.language,
        currency: account.currency,
      })}
    >
      <div className="flex flex-col gap-4">
        <Field label={t("accounts.detail.payFromAccount")}>
          <Select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            options={[
              { value: "", label: t("accounts.detail.payFromAccountPlaceholder") },
              ...options,
            ]}
            aria-label={t("accounts.detail.payFromAccount")}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!fromAccountId || payCreditStatement.isPending}
            onClick={() =>
              payCreditStatement.mutate(
                { id: account.id, statementId: statement.id, fromAccountId },
                {
                  onSuccess: () => {
                    toast.success(t("accounts.actions.payCreditSuccess"));
                    onOpenChange(false);
                    setFromAccountId("");
                  },
                  onError: (err) => {
                    const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
                    toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
                  },
                },
              )
            }
          >
            {t("accounts.actions.payCredit")}
          </Button>
        </div>
      </div>
    </ResponsiveSurface>
  );
}

/** Correct a PAID statement's frozen amount — no cascade to the linked payment
 * transaction or to `creditUsed` (see `CreditStatement`). */
function CorrectAmountModal({
  account,
  statement,
  onOpenChange,
}: {
  account: accounts.BankAccount;
  statement: accounts.CreditStatement | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { updateCreditStatement } = useAccountMutations();
  const [amount, setAmount] = useState(statement?.amount ?? "0");
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!statement) return null;

  return (
    <ResponsiveSurface
      open={statement !== null}
      onOpenChange={onOpenChange}
      title={t("accounts.actions.correctAmount")}
      description={t("accounts.detail.correctAmountHint")}
      className="max-w-sm"
    >
      <div className="flex flex-col gap-4">
        <Field label={t("accounts.detail.billingAmount")}>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            aria-label={t("accounts.detail.billingAmount")}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!amount} onClick={() => setConfirmOpen(true)}>
            {t("accounts.actions.save")}
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("accounts.detail.correctAmountConfirm")}
        loading={updateCreditStatement.isPending}
        onConfirm={() =>
          updateCreditStatement.mutate(
            { id: account.id, statementId: statement.id, amount },
            {
              onSuccess: () => {
                toast.success(t("accounts.actions.correctAmountSuccess"));
                setConfirmOpen(false);
                onOpenChange(false);
              },
              onError: () => toast.error(t("errors.INTERNAL_ERROR")),
            },
          )
        }
      />
    </ResponsiveSurface>
  );
}
