import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { debts } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { ErrorState, LoadingState } from "../../../shared/ui/states";
import { DebtCreateModal } from "../components/DebtCreateModal";
import { DebtKpiStrip } from "../components/DebtKpiStrip";
import { DebtTable } from "../components/DebtTable";
import { useDebtMutations } from "../hooks/useDebtMutations";
import { useDebts } from "../hooks/useDebts";

type DirectionFilter = "ALL" | "OWED_TO_YOU" | "YOU_OWE";
type StatusFilter = "active" | "settled" | "all";

export function DebtsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useDebts();
  const { settle, unsettle, registerPayment, undoPayment, remove } = useDebtMutations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<debts.Debt | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const list = data ?? [];
  const activeDebts = list.filter((d) => d.settledAt === null);
  const uniquePeople = new Set(activeDebts.map((d) => d.counterparty)).size;

  const filtered = useMemo(() => {
    return list
      .filter((d) => directionFilter === "ALL" || d.direction === directionFilter)
      .filter((d) => {
        if (statusFilter === "active") return d.settledAt === null;
        if (statusFilter === "settled") return d.settledAt !== null;
        return true;
      })
      .sort((a, b) => {
        if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [list, directionFilter, statusFilter]);

  const directionOptions: { value: DirectionFilter; label: string }[] = [
    { value: "ALL", label: t("debts.filters.all") },
    { value: "OWED_TO_YOU", label: t("debts.direction.OWED_TO_YOU") },
    { value: "YOU_OWE", label: t("debts.direction.YOU_OWE") },
  ];

  function handleSettle(id: string) {
    settle.mutate(id, {
      onSuccess: () => toast.success(t("debts.updated")),
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  function handleUnsettle(id: string) {
    unsettle.mutate(id, {
      onSuccess: () => toast.success(t("debts.updated")),
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  function handleRegisterPayment(id: string) {
    registerPayment.mutate(id, {
      onSuccess: () => toast.success(t("debts.card.registerPayment")),
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  function handleUndoPayment(id: string) {
    undoPayment.mutate(id, {
      onSuccess: () => toast.success(t("debts.card.undoPayment")),
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  function handleEdit(debt: debts.Debt) {
    setEditingDebt(debt);
    setModalOpen(true);
  }

  function handleDelete(id: string) {
    setDeleteId(id);
  }

  function confirmDelete() {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => {
        toast.success(t("debts.deleted"));
        setDeleteId(null);
      },
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  function handleModalChange(open: boolean) {
    setModalOpen(open);
    if (!open) setEditingDebt(null);
  }

  const subtitle =
    activeDebts.length > 0
      ? t("debts.subtitle", { count: activeDebts.length, people: uniquePeople })
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("debts.title")}
        description={subtitle}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("debts.new")}
          </Button>
        }
      />

      {isLoading && <LoadingState title={t("app.loading")} />}
      {!isLoading && isError && <ErrorState title={t("errors.INTERNAL_ERROR")} />}

      {!isLoading && !isError && (
        <>
          {activeDebts.length > 0 && <DebtKpiStrip debts={activeDebts} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={directionFilter}
                onChange={setDirectionFilter}
                options={directionOptions}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-md border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="active">{t("debts.filters.active")}</option>
                <option value="settled">{t("debts.filters.settled")}</option>
                <option value="all">{t("debts.filters.allStatus")}</option>
              </select>
            </div>
            <span className="text-sm text-muted-foreground">{t("debts.filters.sortByDue")}</span>
          </div>

          <DebtTable
            debts={filtered}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSettle={handleSettle}
            onUnsettle={handleUnsettle}
            onRegisterPayment={handleRegisterPayment}
            onUndoPayment={handleUndoPayment}
          />
        </>
      )}

      <DebtCreateModal
        open={modalOpen}
        onOpenChange={handleModalChange}
        initialData={editingDebt ?? undefined}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={confirmDelete}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDelete")}
        loading={remove.isPending}
      />
    </div>
  );
}
