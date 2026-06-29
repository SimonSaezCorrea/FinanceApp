import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { ErrorState, LoadingState } from "../../../shared/ui/states";
import { Segmented } from "../../../shared/ui/segmented";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { TransactionCreateModal } from "../components/TransactionCreateModal";
import { TransactionKpiStrip } from "../components/TransactionKpiStrip";
import { TransactionFiltersBar } from "../components/TransactionFiltersBar";
import { TransactionTable } from "../components/TransactionTable";
import { useTransactions } from "../hooks/useTransactions";
import { clientFilter, endOfMonth, startOfMonth } from "../lib/transactionMetrics";
import type { TransactionViewFilters } from "../lib/transactionMetrics";
import type { transactions } from "@finance/contracts";

const now = new Date();

const DEFAULT_FILTERS: TransactionViewFilters = {
  categorySearch: "",
  showInactiveAccounts: false,
  from: startOfMonth(now),
  to: endOfMonth(now),
};

export function TransactionsRoute() {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState<TransactionViewFilters>(DEFAULT_FILTERS);

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
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" disabled>
              {t("transactions.table.import")}
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              + {t("transactions.new")}
            </Button>
          </div>
        }
      />

      <Segmented
        value={filters.type ?? "ALL"}
        onChange={handleSegment}
        options={segmentedOptions}
        aria-label={t("transactions.filters.all")}
        className="self-start"
      />

      <TransactionKpiStrip transactions={visibleTxs} />

      <TransactionFiltersBar
        filters={filters}
        onChange={setFilters}
        accounts={accounts}
      />

      {txQuery.isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : txQuery.isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : (
        <TransactionTable transactions={visibleTxs} accounts={accounts} />
      )}

      <TransactionCreateModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
