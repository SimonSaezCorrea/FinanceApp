import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { toast } from "sonner";

import { Button } from "@finance/ui/src/shared/ui/button";
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
import { sumMoney } from "@finance/money";
import { formatDateRangeLabel } from "../components/DateRangeButton";
import { BulkAssignBar } from "../components/BulkAssignBar";
import { CoverTransferPanel } from "../components/CoverTransferPanel";
import { CustomFieldFilter } from "../components/CustomFieldFilter";
import { useCustomFields } from "../../custom-fields/hooks/useCustomFields";
import {
  filterFromSearchParams,
  toApiFilter,
  writeSearchParams,
  type CustomFieldFilter as FieldFilter,
} from "../lib/customFieldFilter";

const now = new Date();

const DEFAULT_FILTERS: TransactionViewFilters = {
  categoryId: "",
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
  // The custom field filter lives in the URL (the "Columnas propias" summary links to it).
  // Arriving with one, the list is not narrowed to this month: what is pending is
  // pending whenever it happened.
  const [searchParams, setSearchParams] = useSearchParams();
  const [fieldFilter, setFieldFilterState] = useState<FieldFilter | undefined>(() =>
    filterFromSearchParams(searchParams),
  );
  const [filters, setFilters] = useState<TransactionViewFilters>(() =>
    filterFromSearchParams(searchParams)
      ? { ...DEFAULT_FILTERS, from: undefined, to: undefined }
      : DEFAULT_FILTERS,
  );
  const { remove } = useTransactionMutations();
  const { data: fieldList } = useCustomFields();
  const fields = fieldList ?? [];
  const columnFields = fields.filter((f) => f.showAsColumn);

  // Selection mode (specs/036): bulk assignment and "Transferir pendientes".
  // `transferir=1` (from a column's "Transferir pendientes"): arrive selecting every movement
  // the field filter shows, so the action is one click away.
  const arrivesToCover = searchParams.get("transferir") === "1";
  const [selecting, setSelecting] = useState(arrivesToCover);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(arrivesToCover);
  // Read once: drop it from the address so a reload or Back doesn't select again.
  useEffect(() => {
    if (!arrivesToCover) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("transferir");
        return params;
      },
      { replace: true },
    );
  }, [arrivesToCover, setSearchParams]);
  const [coverOpen, setCoverOpen] = useState(false);
  const clearSelection = () => {
    setSelectedIds(new Set());
    setAllFiltered(false);
  };
  const stopSelecting = () => {
    clearSelection();
    setSelecting(false);
  };
  const setFieldFilter = (next: FieldFilter | undefined) => {
    setFieldFilterState(next);
    clearSelection();
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        writeSearchParams(params, next);
        return params;
      },
      { replace: true },
    );
  };
  const changeFilters = (next: TransactionViewFilters) => {
    setFilters(next);
    clearSelection();
  };

  // Fetch all accounts once; FiltersBar handles active/inactive grouping
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const apiAccountId = filters.selectedCardId ? undefined : filters.bankAccountId;
  // The category is a server-side filter: with the list paginated, matching in
  // the browser would only ever search the pages already loaded.
  const apiFilters = {
    type: filters.type,
    bankAccountId: apiAccountId,
    cardId: filters.selectedCardId,
    from: filters.from,
    to: filters.to,
    categoryId: filters.categoryId || undefined,
    ...toApiFilter(fieldFilter),
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

  const categoryIds = summaryQuery.data?.categoryIds ?? [];

  // "Transferir pendientes" needs a yes/no field filtered by one of its values; the
  // movements then take the other one.
  const coverField =
    fieldFilter?.mode === "value"
      ? fields.find((f) => f.id === fieldFilter.fieldId && f.type === "BOOLEAN")
      : undefined;
  const coverValue = fieldFilter?.mode === "value" ? fieldFilter.value !== "true" : true;
  const filteredTotal = summaryQuery.data?.total ?? 0;
  const coverCount = allFiltered ? filteredTotal : selectedIds.size;
  const coverAmount = (() => {
    if (allFiltered) {
      const totals = summaryQuery.data?.currencyTotals ?? [];
      const [only] = totals;
      if (totals.length !== 1 || !only) return null;
      const income = Number(only.income) !== 0;
      const expense = Number(only.expense) !== 0;
      if (income === expense) return null;
      return { value: income ? only.income : only.expense, currency: only.currency };
    }
    const chosen = visibleTxs.filter((tx) => selectedIds.has(tx.id));
    if (
      chosen.length === 0 ||
      new Set(chosen.map((tx) => tx.currency)).size !== 1 ||
      new Set(chosen.map((tx) => tx.type)).size !== 1
    ) {
      return null;
    }
    return { value: sumMoney(chosen.map((tx) => tx.amount)), currency: chosen[0]!.currency };
  })();
  // Every movement the filter shows, without paging: what "todos los del filtro" means.
  const bulkFilter = apiFilters;

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
            <Button
              variant="outline"
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting ? t("customFields.bulk.cancel") : t("customFields.bulk.select")}
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
          onChange={changeFilters}
          accounts={accounts}
          categoryIds={categoryIds}
        />
        <CustomFieldFilter fields={fields} value={fieldFilter} onChange={setFieldFilter} />
      </div>

      {selecting ? (
        <BulkAssignBar
          fields={fields}
          selectedIds={[...selectedIds]}
          allFiltered={allFiltered}
          filter={bulkFilter}
          filteredTotal={filteredTotal}
          onSelectAllFiltered={() => setAllFiltered(true)}
          onDone={clearSelection}
          onCancel={stopSelecting}
          extra={
            coverField ? (
              <Button
                variant="accent"
                size="sm"
                disabled={coverCount === 0}
                onClick={() => setCoverOpen(true)}
              >
                {t("customFields.cover.action")}
              </Button>
            ) : null
          }
        />
      ) : null}

      {txQuery.isLoading ? (
        <MovementsTableSkeleton showCategoryColumn={false} showTypeColumn={false} />
      ) : (
        <TransactionTable
          highlightId={savedId}
          transactions={txQuery.isError ? [] : visibleTxs}
          accounts={accounts}
          showCategoryColumn={false}
          showTypeColumn={false}
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
          columnFields={columnFields}
          selection={
            selecting
              ? {
                  selected: allFiltered ? new Set(visibleTxs.map((tx) => tx.id)) : selectedIds,
                  onToggle: (id) => {
                    const base = allFiltered ? new Set(visibleTxs.map((tx) => tx.id)) : selectedIds;
                    const next = new Set(base);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setAllFiltered(false);
                    setSelectedIds(next);
                  },
                }
              : undefined
          }
        />
      )}

      {coverField ? (
        <CoverTransferPanel
          open={coverOpen}
          onOpenChange={setCoverOpen}
          field={coverField}
          value={coverValue}
          target={allFiltered ? { filter: bulkFilter } : { ids: [...selectedIds] }}
          count={coverCount}
          amount={coverAmount}
          accounts={accounts}
          onDone={stopSelecting}
        />
      ) : null}

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
