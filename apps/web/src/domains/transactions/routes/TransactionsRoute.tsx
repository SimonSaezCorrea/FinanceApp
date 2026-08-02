import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "sonner";

import { Button } from "../../../shared/ui/button";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { PageHeader } from "../../../shared/ui/page-header";
import { ErrorState, LoadingState } from "../../../shared/ui/states";
import { Segmented } from "../../../shared/ui/segmented";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { TransactionCreateModal } from "../components/TransactionCreateModal";
import { TransactionDetailModal } from "../components/TransactionDetailModal";
import { TransactionKpiStrip } from "../components/TransactionKpiStrip";
import { TransactionFiltersBar } from "../components/TransactionFiltersBar";
import { TransactionTable } from "../components/TransactionTable";
import { useTransactions } from "../hooks/useTransactions";
import { useTransactionMutations } from "../hooks/useTransactionMutations";
import {
  clientFilter,
  endOfMonth,
  isFullMonthRange,
  startOfMonth,
  uniqueCategories,
} from "../lib/transactionMetrics";
import type { TransactionViewFilters } from "../lib/transactionMetrics";
import type { transactions } from "@finance/contracts";
import { formatDateRangeLabel } from "../components/DateRangeButton";

const now = new Date();

const DEFAULT_FILTERS: TransactionViewFilters = {
  categorySearch: "",
  showInactiveAccounts: false,
  from: startOfMonth(now),
  to: endOfMonth(now),
};

export function TransactionsRoute() {
  const { t, i18n } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTx, setEditTx] = useState<transactions.Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<transactions.Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<transactions.Transaction | null>(null);
  const [filters, setFilters] = useState<TransactionViewFilters>(DEFAULT_FILTERS);
  const { remove } = useTransactionMutations();

  // Fetch all accounts once; FiltersBar handles active/inactive grouping
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const apiAccountId = filters.selectedCardId ? undefined : filters.bankAccountId;
  const apiFilters = {
    type: filters.type,
    bankAccountId: apiAccountId,
    cardId: filters.selectedCardId,
    from: filters.from,
    to: filters.to,
  };
  const txQuery = useTransactions(apiFilters);

  const visibleTxs = useMemo(() => {
    const fetched = txQuery.data ?? [];
    return clientFilter(fetched, filters.categorySearch);
  }, [txQuery.data, filters.categorySearch]);

  const categories = useMemo(() => uniqueCategories(txQuery.data ?? []), [txQuery.data]);

  const periodLabel = useMemo(() => {
    const count = visibleTxs.length;
    if (isFullMonthRange(filters.from, filters.to)) {
      const month = new Date(filters.from!).toLocaleDateString(i18n.language, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      return t("transactions.subtitle", { month, count });
    }
    if (filters.from || filters.to) {
      const range = formatDateRangeLabel(filters.from, filters.to, i18n.language);
      return t("transactions.subtitleRange", { range, count });
    }
    return t("transactions.subtitleAll", { count });
  }, [filters.from, filters.to, visibleTxs.length, t, i18n.language]);

  const segmentedOptions: { value: transactions.TransactionType | "ALL"; label: string }[] = [
    { value: "ALL", label: t("transactions.filters.all") },
    { value: "INCOME", label: t("transactions.filters.income") },
    { value: "EXPENSE", label: t("transactions.filters.expense") },
  ];

  function handleSegment(value: transactions.TransactionType | "ALL") {
    setFilters((f) => ({ ...f, type: value === "ALL" ? undefined : value }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("transactions.title")}
        description={periodLabel}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" disabled>
              {t("transactions.table.import")}
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                setEditTx(null);
                setModalOpen(true);
              }}
            >
              + {t("transactions.new")}
            </Button>
          </div>
        }
      />

      <TransactionKpiStrip transactions={visibleTxs} from={filters.from} to={filters.to} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filters.type ?? "ALL"}
          onChange={handleSegment}
          options={segmentedOptions}
          aria-label={t("transactions.filters.all")}
        />

        <TransactionFiltersBar
          filters={filters}
          onChange={setFilters}
          accounts={accounts}
          categories={categories}
        />
      </div>

      {txQuery.isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : txQuery.isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : (
        <TransactionTable
          transactions={visibleTxs}
          accounts={accounts}
          onEdit={(tx) => {
            setEditTx(tx);
            setModalOpen(true);
          }}
          onDelete={(tx) => setDeleteTx(tx)}
          onRowClick={(tx) => setDetailTx(tx)}
        />
      )}

      <TransactionCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editTx ?? undefined}
      />

      <TransactionDetailModal
        transaction={detailTx}
        accounts={accounts}
        open={detailTx !== null}
        onOpenChange={(v) => !v && setDetailTx(null)}
        onEdit={(tx) => {
          setEditTx(tx);
          setModalOpen(true);
        }}
        onDelete={(tx) => setDeleteTx(tx)}
      />

      <ConfirmDialog
        open={deleteTx !== null}
        onOpenChange={(v) => !v && setDeleteTx(null)}
        title={t("transactions.deleteConfirm")}
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleteTx) return;
          remove.mutate(deleteTx.id, {
            onSuccess: () => {
              toast.success(t("transactions.deleted"));
              setDeleteTx(null);
            },
            onError: () => toast.error(t("errors.INTERNAL_ERROR")),
          });
        }}
      />
    </div>
  );
}
