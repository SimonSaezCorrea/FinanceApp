import { useTranslation } from "react-i18next";

import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { Card } from "../../../shared/ui/card";
import { Skeleton } from "../../../shared/ui/skeleton";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { FULL_TABLE_MIN_WIDTH } from "./TransactionTable";

/** Compact-list row, for the narrow layout where the real table drops its columns. */
function MovementRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-[13px] w-2/5" />
        <Skeleton className="h-[11px] w-1/4" />
      </div>
      <Skeleton className="hidden h-[11px] w-20 shrink-0 sm:block" />
      <Skeleton className="h-[13px] w-24 shrink-0" />
    </div>
  );
}

/**
 * The movements table's own loading shape — shown with its real headers up
 * front (they're ours, fixed, and never depend on the response), same
 * convention every other list's skeleton in this app already follows
 * (`InstallmentsSkeleton`, `BillingTableSkeleton`): a load in progress is not
 * "there's nothing to show you yet", so it keeps the table's chrome instead
 * of swapping in a generic centered spinner.
 *
 * Used both by the main Movimientos route (full table, `showAccountColumn`
 * true) and an account's own Movimientos tab (`showAccountColumn={false}` —
 * every row is already that account by construction). It measures itself and
 * splits at the SAME width as `TransactionTable`, so the placeholder and the
 * real table always agree on which of the two shapes is on screen. "Tarjeta"
 * is the one column left out — the real table only shows it when the visible
 * rows use more than one card, which is a property of the data.
 */
export function MovementsTableSkeleton({
  rows = 6,
  showAccountColumn = true,
}: Readonly<{ rows?: number; showAccountColumn?: boolean }>) {
  const { t } = useTranslation();
  const [containerRef, width] = useElementWidth();
  // Same fallback as the real table: the compact list works at any width.
  const wide = width !== null && width >= FULL_TABLE_MIN_WIDTH;

  return (
    <Card ref={containerRef} className="overflow-hidden p-0" aria-busy="true">
      <div className={wide ? "block" : "hidden"}>
        <Table>
          <THead className="bg-muted/50">
            <TR>
              <TH className="w-8" />
              <TH>{t("transactions.form.description")}</TH>
              <TH>{t("transactions.form.category")}</TH>
              <TH>{t("transactions.form.type")}</TH>
              {showAccountColumn ? <TH>{t("transactions.form.account")}</TH> : null}
              <TH className="whitespace-nowrap">{t("transactions.form.date")}</TH>
              <TH numeric>{t("transactions.form.amount")}</TH>
              <TH className="w-20" />
            </TR>
          </THead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <TR key={i}>
                <TD>
                  <Skeleton className="h-8 w-8 rounded-full" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-40" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-24" />
                </TD>
                <TD>
                  <Skeleton className="h-[20px] w-16 rounded-full" />
                </TD>
                {showAccountColumn ? (
                  <TD>
                    <Skeleton className="h-[13px] w-24" />
                  </TD>
                ) : null}
                <TD>
                  <Skeleton className="h-[13px] w-24" />
                </TD>
                <TD numeric>
                  <Skeleton className="ml-auto h-[13px] w-24" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-12" />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>

      <div className={wide ? "hidden" : "block"}>
        {Array.from({ length: rows }, (_, i) => (
          <MovementRowSkeleton key={i} />
        ))}
      </div>
    </Card>
  );
}
