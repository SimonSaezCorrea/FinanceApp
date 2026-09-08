import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "sonner";

import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { TransactionDeleteConfirm } from "../components/TransactionDeleteConfirm";
import { TransactionCreateModal } from "../components/TransactionCreateModal";
import { TransactionDetailModal } from "../components/TransactionDetailModal";
import { TransactionKpiStrip } from "../components/TransactionKpiStrip";
import { TransactionFiltersBar } from "../components/TransactionFiltersBar";
import { TransactionTable } from "../components/TransactionTable";
import { MovementsTableSkeleton } from "../components/MovementsTableSkeleton";
import { useInfiniteTransactions, useTransactionsSummary } from "../hooks/useTransactions";
import { useTransactionMutations } from "../hooks/useTransactionMutations";
import { endOfMonth, isFullMonthRange, startOfMonth } from "../lib/transactionMetrics";
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
  const [duplicateTx, setDuplicateTx] = useState<transactions.Transaction | null>(null);
  // Set at OPEN time by whichever entry point triggered the form, and left
  // alone while it's open or mid-close-animation — flipping it on close would
  // move the form to a different JSX parent (top-level vs. nested in the
  // detail panel) in the very render that starts the exit animation, which
  // remounts it instead of letting it animate out.
  const [formNested, setFormNested] = useState(false);
  // Just saved: the table points it out for a moment, since a movement dated
  // earlier than the ones on screen does NOT land at the top.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deleteTx, setDeleteTx] = useState<transactions.Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<transactions.Transaction | null>(null);
  const [filters, setFilters] = useState<TransactionViewFilters>(DEFAULT_FILTERS);
  const { remove } = useTransactionMutations();

  // Fetch all accounts once; FiltersBar handles active/inactive grouping
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const apiAccountId = filters.selectedCardId ? undefined : filters.bankAccountId;
  // The category search is a server-side filter now: with the list paginated,
  // matching in the browser would only ever search the pages already loaded.
  const apiFilters = {
    type: filters.type,
    bankAccountId: apiAccountId,
    cardId: filters.selectedCardId,
    from: filters.from,
    to: filters.to,
    category: filters.categorySearch.trim() || undefined,
  };
  const txQuery = useInfiniteTransactions(apiFilters);
  // Count, per-currency totals and the category options describe the whole
  // filtered set, so they come from the aggregate endpoint rather than from
  // however many pages happen to be loaded.
  const summaryQuery = useTransactionsSummary(apiFilters);

  const visibleTxs = useMemo(
    () => txQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [txQuery.data],
  );

  const categories = summaryQuery.data?.categories ?? [];

  const periodLabel = useMemo(() => {
    const count = summaryQuery.data?.total ?? 0;
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
  }, [filters.from, filters.to, summaryQuery.data?.total, t, i18n.language]);

  const segmentedOptions: { value: transactions.TransactionType | "ALL"; label: string }[] = [
    { value: "ALL", label: t("transactions.filters.all") },
    { value: "INCOME", label: t("transactions.filters.income") },
    { value: "EXPENSE", label: t("transactions.filters.expense") },
  ];

  function handleSegment(value: transactions.TransactionType | "ALL") {
    setFilters((f) => ({ ...f, type: value === "ALL" ? undefined : value }));
  }

  const createModal = (
    <TransactionCreateModal
      open={modalOpen}
      onOpenChange={setModalOpen}
      initial={editTx ?? undefined}
      duplicateFrom={duplicateTx ?? undefined}
      // Full-size even when nested in the detail panel (unlike `CardFormPanel`'s
      // "compact" convention) — a movement's edit form is substantial enough
      // that narrowing it to make room for the detail behind would cramp it
      // for no benefit; the detail isn't meant to stay visible alongside it.
      // `nested` still elevates its z-index above the detail panel it was
      // opened from, so it overlaps it fully instead of stacking behind.
      size="default"
      nested={formNested}
      onSaved={setSavedId}
    />
  );

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
                setDuplicateTx(null);
                setFormNested(false);
                setModalOpen(true);
              }}
            >
              + {t("transactions.new")}
            </Button>
          </div>
        }
      />

      <TransactionKpiStrip
        currencyTotals={summaryQuery.data?.currencyTotals ?? []}
        from={filters.from}
        to={filters.to}
      />

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
        <MovementsTableSkeleton />
      ) : (
        <TransactionTable
          highlightId={savedId}
          transactions={txQuery.isError ? [] : visibleTxs}
          accounts={accounts}
          onEdit={(tx) => {
            setEditTx(tx);
            setDuplicateTx(null);
            setFormNested(false);
            setModalOpen(true);
          }}
          onDelete={(tx) => setDeleteTx(tx)}
          onRowClick={(tx) => setDetailTx(tx)}
          hasMore={txQuery.hasNextPage}
          isLoadingMore={txQuery.isFetchingNextPage}
          onLoadMore={() => void txQuery.fetchNextPage()}
          error={txQuery.error}
          onRetry={() => txQuery.refetch()}
        />
      )}

      {/* Opened from the table or the "+ Nuevo movimiento" button: the detail
          panel isn't open, so this renders at the top level like any other
          overlay. Opened FROM the detail panel instead, it's rendered nested
          inside it (below) — same reasoning as `CardFormPanel` inside
          `AccountCreateModal`: a sibling Dialog reads a Radix dismiss on the
          new one as an outside click on the old one, so nesting is what lets
          the detail panel stay open underneath instead of closing first. */}
      {!formNested && createModal}

      <TransactionDetailModal
        transaction={detailTx}
        accounts={accounts}
        open={detailTx !== null}
        onOpenChange={(v) => !v && setDetailTx(null)}
        onEdit={(tx) => {
          setEditTx(tx);
          setDuplicateTx(null);
          setFormNested(true);
          setModalOpen(true);
        }}
        onDuplicate={(tx) => {
          setEditTx(null);
          setDuplicateTx(tx);
          setFormNested(true);
          setModalOpen(true);
        }}
        onDelete={(tx) => setDeleteTx(tx)}
        // The panel pages through the very set the table behind is showing.
        items={visibleTxs}
        total={summaryQuery.data?.total}
        hasNextPage={txQuery.hasNextPage}
        onLoadMore={() => void txQuery.fetchNextPage()}
        onNavigate={(tx) => setDetailTx(tx)}
        dateFiltered={Boolean(filters.from || filters.to)}
      >
        {formNested && createModal}
      </TransactionDetailModal>

      <TransactionDeleteConfirm
        transaction={deleteTx}
        accounts={accounts}
        loading={remove.isPending}
        onOpenChange={(v) => !v && setDeleteTx(null)}
        onConfirm={() => {
          if (!deleteTx) return;
          remove.mutate(deleteTx.id, {
            onSuccess: () => {
              toast.success(t("transactions.deleted"));
              setDeleteTx(null);
              if (detailTx?.id === deleteTx.id) setDetailTx(null);
            },
            onError: () => toast.error(t("errors.INTERNAL_ERROR")),
          });
        }}
      />
    </div>
  );
}
