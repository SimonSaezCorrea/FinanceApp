import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { installments } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { InstallmentCreateModal } from "../components/InstallmentCreateModal";
import { InstallmentPlanCard } from "../components/InstallmentPlanCard";
import { PaymentCalendar } from "../components/PaymentCalendar";
import { useInstallmentMutations } from "../hooks/useInstallmentMutations";
import { useInstallments } from "../hooks/useInstallments";

export function InstallmentsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useInstallments();
  const { remove } = useInstallmentMutations();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<installments.InstallmentPlan | null>(null);

  const list = data ?? [];
  const selectedPlan = list.find((p) => p.id === selectedPlanId) ?? null;

  function handleEdit(plan: installments.InstallmentPlan) {
    setEditingPlan(plan);
    setModalOpen(true);
  }

  function handleDelete(id: string) {
    if (!globalThis.confirm(t("common.confirmDelete"))) return;
    remove.mutate(id, {
      onSuccess: () => {
        toast.success(t("installments.deleted"));
        if (selectedPlanId === id) setSelectedPlanId(null);
      },
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  function handleModalChange(open: boolean) {
    setModalOpen(open);
    if (!open) setEditingPlan(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("installments.title")}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("installments.new")}
          </Button>
        }
      />

      {isLoading && <LoadingState title={t("app.loading")} />}
      {!isLoading && isError && <ErrorState title={t("errors.INTERNAL_ERROR")} />}
      {!isLoading && !isError && list.length === 0 && (
        <EmptyState title={t("installments.empty")} />
      )}
      {!isLoading && !isError && list.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((plan) => (
              <InstallmentPlanCard
                key={plan.id}
                plan={plan}
                selected={plan.id === selectedPlanId}
                onSelect={() =>
                  setSelectedPlanId((prev) => (prev === plan.id ? null : plan.id))
                }
                onEdit={() => handleEdit(plan)}
                onDelete={() => handleDelete(plan.id)}
              />
            ))}
          </div>

          {selectedPlan ? <PaymentCalendar plan={selectedPlan} /> : null}
        </div>
      )}

      <InstallmentCreateModal
        open={modalOpen}
        onOpenChange={handleModalChange}
        initialData={editingPlan ?? undefined}
      />
    </div>
  );
}
