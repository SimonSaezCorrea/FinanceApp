import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { debts } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { DebtCard } from "../components/DebtCard";
import { DebtCreateModal } from "../components/DebtCreateModal";
import { DebtKpiStrip } from "../components/DebtKpiStrip";
import { useDebtMutations } from "../hooks/useDebtMutations";
import { useDebts } from "../hooks/useDebts";

export function DebtsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useDebts();
  const { settle, registerPayment, remove } = useDebtMutations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<debts.Debt | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const list = data ?? [];
  const activeDebts = list.filter((d) => d.settledAt === null);
  const owedToYou = activeDebts.filter((d) => d.direction === "OWED_TO_YOU");
  const youOwe = activeDebts.filter((d) => d.direction === "YOU_OWE");

  function handleSettle(id: string) {
    settle.mutate(id, {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("debts.title")}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("debts.new")}
          </Button>
        }
      />

      {isLoading && <LoadingState title={t("app.loading")} />}
      {!isLoading && isError && <ErrorState title={t("errors.INTERNAL_ERROR")} />}
      {!isLoading && !isError && activeDebts.length === 0 && (
        <EmptyState title={t("debts.empty")} />
      )}
      {!isLoading && !isError && activeDebts.length > 0 && (
        <>
          <DebtKpiStrip debts={activeDebts} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-success">
                {t("debts.direction.OWED_TO_YOU")}
              </h2>
              {owedToYou.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                owedToYou.map((d) => (
                  <DebtCard
                    key={d.id}
                    debt={d}
                    onSettle={() => handleSettle(d.id)}
                    onRegisterPayment={() => handleRegisterPayment(d.id)}
                    onEdit={() => handleEdit(d)}
                    onDelete={() => handleDelete(d.id)}
                  />
                ))
              )}
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-accent">
                {t("debts.direction.YOU_OWE")}
              </h2>
              {youOwe.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                youOwe.map((d) => (
                  <DebtCard
                    key={d.id}
                    debt={d}
                    onSettle={() => handleSettle(d.id)}
                    onRegisterPayment={() => handleRegisterPayment(d.id)}
                    onEdit={() => handleEdit(d)}
                    onDelete={() => handleDelete(d.id)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      <DebtCreateModal
        open={modalOpen}
        onOpenChange={handleModalChange}
        initialData={editingDebt ?? undefined}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={confirmDelete}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDelete")}
        loading={remove.isPending}
      />
    </div>
  );
}
