import { CalendarDays, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { installments } from "@finance/contracts";

import { Button } from "../../../shared/ui/button";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { ErrorState, LoadingState } from "../../../shared/ui/states";
import { InstallmentCreateModal } from "../components/InstallmentCreateModal";
import { InstallmentKpiStrip } from "../components/InstallmentKpiStrip";
import type { FlatPayment } from "../components/InstallmentPaymentTable";
import { InstallmentPaymentTable } from "../components/InstallmentPaymentTable";
import { useInstallmentMutations } from "../hooks/useInstallmentMutations";
import { useInstallments } from "../hooks/useInstallments";

type StatusFilter = "all" | "upcoming" | "paid";

function flattenPayments(plans: installments.InstallmentPlan[]): FlatPayment[] {
  return plans.flatMap((plan) => {
    const paidCount = plan.payments.filter((p) => p.paidAt !== null).length;
    const nextPayment =
      plan.payments
        .filter((p) => p.paidAt === null)
        .sort((a, b) => a.sequence - b.sequence)[0] ?? null;

    return plan.payments.map((p): FlatPayment => ({
      paymentId: p.id,
      planId: plan.id,
      planTitle: plan.title,
      planInstallmentCount: plan.installmentCount,
      planTotalPrincipal: plan.totalPrincipal,
      planPaidCount: paidCount,
      planNextDueDate: nextPayment?.dueDate ?? null,
      currency: plan.currency,
      sequence: p.sequence,
      dueDate: p.dueDate,
      amount: p.amount,
      paidAt: p.paidAt,
      isNextForPlan: p.sequence === (nextPayment?.sequence ?? null),
    }));
  });
}

export function InstallmentsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useInstallments();
  const { remove, pay, unpay } = useInstallmentMutations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<installments.InstallmentPlan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState(true);

  const list = data ?? [];

  const nextGlobalDue = list
    .flatMap((p) => p.payments.filter((pay) => pay.paidAt === null))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  let subtitle: string | undefined;
  if (list.length > 0 && nextGlobalDue) {
    const dateStr = new Date(nextGlobalDue.dueDate).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
    });
    subtitle = t("installments.subtitle", { count: list.length, date: dateStr });
  } else if (list.length > 0) {
    subtitle = t("installments.subtitleNoNextDue", { count: list.length });
  }

  const allFlat = useMemo(() => flattenPayments(list), [list]);

  const filtered = useMemo(() => {
    const now = new Date();
    const threeMonths = new Date(now);
    threeMonths.setMonth(threeMonths.getMonth() + 3);

    return allFlat
      .filter((p) => {
        if (statusFilter === "upcoming") return p.paidAt === null;
        if (statusFilter === "paid") return p.paidAt !== null;
        return true;
      })
      .filter((p) => planFilter === "all" || p.planId === planFilter)
      .filter((p) => !dateFilter || new Date(p.dueDate) <= threeMonths)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [allFlat, statusFilter, planFilter, dateFilter]);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("installments.filters.all") },
    { value: "upcoming", label: t("installments.filters.upcoming") },
    { value: "paid", label: t("installments.filters.paid") },
  ];

  function handleEditPlan(planId: string) {
    const plan = list.find((p) => p.id === planId);
    if (plan) {
      setEditingPlan(plan);
      setModalOpen(true);
    }
  }

  function handleDeletePlan(planId: string) {
    setDeleteId(planId);
  }

  function confirmDelete() {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => {
        toast.success(t("installments.deleted"));
        setDeleteId(null);
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
        description={subtitle}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("installments.new")}
          </Button>
        }
      />

      {isLoading && <LoadingState title={t("app.loading")} />}
      {!isLoading && isError && <ErrorState title={t("errors.INTERNAL_ERROR")} />}

      {!isLoading && !isError && (
        <>
          {list.length > 0 && <InstallmentKpiStrip plans={list} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
              />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="rounded-md border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">{t("installments.filters.allPlans")}</option>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setDateFilter((v) => !v)}
              className={[
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                dateFilter
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-card text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              <CalendarDays className="h-4 w-4" />
              {t("installments.filters.next3months")}
            </button>
          </div>

          <InstallmentPaymentTable
            payments={filtered}
            onEditPlan={handleEditPlan}
            onDeletePlan={handleDeletePlan}
            onPayPayment={(planId, sequence) =>
              pay.mutate({ planId, sequence }, { onError: () => toast.error(t("errors.INTERNAL_ERROR")) })
            }
            onUnpayPayment={(planId, sequence) =>
              unpay.mutate({ planId, sequence }, { onError: () => toast.error(t("errors.INTERNAL_ERROR")) })
            }
          />
        </>
      )}

      <InstallmentCreateModal
        open={modalOpen}
        onOpenChange={handleModalChange}
        initialData={editingPlan ?? undefined}
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
