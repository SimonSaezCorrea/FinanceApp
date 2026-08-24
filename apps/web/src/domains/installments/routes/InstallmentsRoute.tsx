import type { installments } from "@finance/contracts";
import { CalendarDays, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAccounts, useCreditStatements } from "../../accounts/hooks/useAccounts";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { useTransactionsSummary } from "../../transactions/hooks/useTransactions";
import { cn } from "../../../shared/lib/cn";
import { TABLE_ROW_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { DeletePlanConfirm } from "../components/DeletePlanConfirm";
import { InstallmentDetailPanel } from "../components/InstallmentDetailPanel";
import {
  InstallmentFormPanel,
  emptyInstallmentForm,
  installmentFormFrom,
  type InstallmentFormValue,
} from "../components/InstallmentFormPanel";
import { InstallmentKpiStrip } from "../components/InstallmentKpiStrip";
import { InstallmentPlanList } from "../components/InstallmentPlanList";
import { InstallmentPlanTable } from "../components/InstallmentPlanTable";
import { InstallmentsSkeleton } from "../components/InstallmentsSkeleton";
import {
  PayInstallmentPanel,
  initialPayValue,
  toPayBody,
  type PayInstallmentFormValue,
} from "../components/PayInstallmentPanel";
import { useInstallmentMutations } from "../hooks/useInstallmentMutations";
import { useInstallments } from "../hooks/useInstallments";
import type { PlanFilter } from "../lib/installmentMetrics";
import { visiblePlans } from "../lib/installmentMetrics";

const todayInput = () => new Date().toISOString().slice(0, 10);

export function InstallmentsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useInstallments();
  const { data: accounts } = useAccounts();
  const { data: summary } = useTransactionsSummary();
  const { create, update, remove, pay, unpay } = useInstallmentMutations();

  const [form, setForm] = useState<{ mode: "create" | "edit"; planId: string | null } | null>(null);
  const [formValue, setFormValue] = useState<InstallmentFormValue>(() =>
    emptyInstallmentForm(todayInput()),
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ planId: string; sequence: number } | null>(null);
  const [payValue, setPayValue] = useState<PayInstallmentFormValue | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanFilter>("all");
  const [withinWindow, setWithinWindow] = useState(false);

  /** The row that opened the panel, so closing gives it its focus back (FR-011a). */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [listRef, listWidth] = useElementWidth();
  // Until measured, assume narrow: the stacked list is correct at ANY width, the
  // table is not.
  const showTable = listWidth !== null && listWidth >= TABLE_ROW_MIN_WIDTH;

  const plans = useMemo(() => data ?? [], [data]);
  const accountList = useMemo(() => accounts ?? [], [accounts]);
  const visible = useMemo(
    () => visiblePlans(plans, statusFilter, withinWindow),
    [plans, statusFilter, withinWindow],
  );

  // Read from the live list, never held in state: after paying, the panel must show
  // the plan as it now IS (FR-014a), and a copy taken when it opened would not.
  const selectedPlan = plans.find((p) => p.id === selectedId) ?? null;
  const payingPlan = paying ? (plans.find((p) => p.id === paying.planId) ?? null) : null;
  const payingPayment = payingPlan?.payments.find((p) => p.sequence === paying?.sequence) ?? null;
  const deletingPlan = plans.find((p) => p.id === deleteId) ?? null;

  /** "Banco de Chile · Visa — 3375" per card id, for the table's Tarjeta column. */
  const cardLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const account of accountList) {
      for (const card of account.cards ?? []) {
        labels.set(card.id, `${card.name} — ${card.last4}`);
      }
    }
    return labels;
  }, [accountList]);

  /** The account each card belongs to — for the credit-card plan's billing link
   * (FR-020/FR-023a) and its "ver facturación" statement lookup. */
  const cardAccountIds = useMemo(() => {
    const ids = new Map<string, string>();
    for (const account of accountList) {
      for (const card of account.cards ?? []) {
        ids.set(card.id, account.id);
      }
    }
    return ids;
  }, [accountList]);

  const selectedAccountId = selectedPlan?.cardId
    ? (cardAccountIds.get(selectedPlan.cardId) ?? null)
    : null;
  // Only fetched for whichever plan's panel is open — `useCreditStatements` is a
  // no-op without an id (spec 014, FR-020: needed to tell a fully-paid instalment
  // apart from one whose period settled with a shortfall).
  const { data: selectedPlanStatements } = useCreditStatements(selectedAccountId ?? "");
  const partiallyPaidStatementIds = useMemo(
    () =>
      new Set(
        (selectedPlanStatements ?? [])
          .filter((s) => s.status === "PARTIALLY_PAID")
          .map((s) => s.id),
      ),
    [selectedPlanStatements],
  );

  const statusOptions: { value: PlanFilter; label: string }[] = [
    { value: "all", label: t("installments.filters.all") },
    { value: "unpaid", label: t("installments.filters.upcoming") },
    { value: "paid", label: t("installments.filters.paid") },
  ];

  function openCreate() {
    setFormValue(emptyInstallmentForm(todayInput()));
    setForm({ mode: "create", planId: null });
  }

  function openEdit(plan: installments.InstallmentPlan) {
    setFormValue(installmentFormFrom(plan));
    setForm({ mode: "edit", planId: plan.id });
  }

  function selectPlan(id: string | null) {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setSelectedId(id);
  }

  function closeDetail() {
    setSelectedId(null);
    // The list keeps its order, its width and its scroll (FR-012) because nothing
    // about it changed; what has to be restored is where the keyboard was.
    returnFocusRef.current?.focus?.();
  }

  function openPay(planId: string, sequence: number) {
    const plan = plans.find((p) => p.id === planId);
    const payment = plan?.payments.find((p) => p.sequence === sequence);
    if (!plan || !payment) return;
    setPayValue(initialPayValue(plan, payment, todayInput()));
    setPaying({ planId, sequence });
  }

  function confirmPay() {
    if (!paying || !payingPlan || !payValue) return;
    const account = accountList.find((a) => a.id === payValue.fromAccountId) ?? null;
    pay.mutate(
      {
        planId: paying.planId,
        sequence: paying.sequence,
        body: toPayBody(payValue, payingPlan, account),
      },
      {
        onSuccess: () => {
          toast.success(t("installments.paid"));
          setPaying(null);
          setPayValue(null);
        },
        onError: (error: unknown) => toast.error(errorMessage(error, t)),
      },
    );
  }

  function handleUnpay(planId: string, sequence: number) {
    unpay.mutate(
      { planId, sequence },
      {
        onSuccess: () => toast.success(t("installments.unpaid")),
        onError: (error: unknown) => toast.error(errorMessage(error, t)),
      },
    );
  }

  function submitForm() {
    if (!form) return;
    const common = {
      title: formValue.title.trim(),
      currency: formValue.currency.trim().toUpperCase(),
      frequency: formValue.frequency,
      frequencyInterval: formValue.frequencyInterval,
      cardId: formValue.cardId || null,
      category: formValue.category.trim() || null,
      paymentAccountId: formValue.paymentAccountId || null,
      notes: formValue.notes.trim() || null,
    };

    if (form.mode === "edit" && form.planId) {
      update.mutate(
        { id: form.planId, body: common },
        {
          onSuccess: () => {
            toast.success(t("installments.updated"));
            setForm(null);
          },
          onError: (error: unknown) => toast.error(errorMessage(error, t)),
        },
      );
      return;
    }

    create.mutate(
      {
        ...common,
        totalPrincipal: formValue.totalPrincipal.trim(),
        installmentCount: formValue.installmentCount,
        startDate: new Date(formValue.startDate).toISOString(),
        aprPerPeriod: formValue.aprPerPeriod.trim() || undefined,
        notes: formValue.notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("installments.created"));
          setForm(null);
        },
        onError: (error: unknown) => toast.error(errorMessage(error, t)),
      },
    );
  }

  function confirmDelete() {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => {
        toast.success(t("installments.deleted"));
        setDeleteId(null);
        if (selectedId === deleteId) setSelectedId(null);
      },
      onError: (error: unknown) => toast.error(errorMessage(error, t)),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("installments.title")}
        description={
          plans.length > 0 ? t("installments.subtitleCount", { count: plans.length }) : undefined
        }
        actions={
          <Button variant="accent" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("installments.new")}
          </Button>
        }
      />

      {isLoading && <InstallmentsSkeleton label={t("app.loading")} />}
      {/* A failed load is not "you have no plans" — saying so would be a lie the user
          acts on. */}
      {!isLoading && isError && <ErrorState title={t("errors.INTERNAL_ERROR")} />}

      {!isLoading && !isError && plans.length === 0 && (
        // The CTA lives in the page header, which is always on screen — a second
        // button inside the empty state would be the same action twice.
        <EmptyState title={t("installments.empty")} message={t("installments.emptyHint")} />
      )}

      {!isLoading && !isError && plans.length > 0 && (
        <>
          <InstallmentKpiStrip plans={plans} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
              <button
                type="button"
                onClick={() => setWithinWindow((v) => !v)}
                aria-pressed={withinWindow}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  withinWindow
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                <CalendarDays className="h-4 w-4" aria-hidden />
                {t("installments.filters.next3months")}
              </button>
            </div>
            <span className="text-sm text-muted-foreground">
              {t("installments.visibleCount", { count: visible.length })}
            </span>
          </div>

          <div ref={listRef}>
            {visible.length === 0 ? (
              <EmptyState title={t("installments.noneMatchFilters")} />
            ) : showTable ? (
              <InstallmentPlanTable
                plans={visible}
                cardLabels={cardLabels}
                selectedId={selectedId}
                onSelect={selectPlan}
                onEdit={openEdit}
                onDelete={setDeleteId}
              />
            ) : (
              <InstallmentPlanList
                plans={visible}
                selectedId={selectedId}
                onSelect={selectPlan}
                onEdit={openEdit}
                onDelete={setDeleteId}
              />
            )}
          </div>
        </>
      )}

      <InstallmentDetailPanel
        plan={selectedPlan}
        cardLabel={selectedPlan?.cardId ? (cardLabels.get(selectedPlan.cardId) ?? null) : null}
        accountId={selectedAccountId}
        partiallyPaidStatementIds={partiallyPaidStatementIds}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        onPay={(sequence) => selectedPlan && openPay(selectedPlan.id, sequence)}
        onUnpay={(sequence) => selectedPlan && handleUnpay(selectedPlan.id, sequence)}
        onEdit={() => selectedPlan && openEdit(selectedPlan)}
        onDelete={() => selectedPlan && setDeleteId(selectedPlan.id)}
        busySequence={pay.isPending || unpay.isPending ? (paying?.sequence ?? -1) : null}
      />

      {payingPlan && payingPayment && payValue && (
        <PayInstallmentPanel
          open
          onOpenChange={(open) => {
            if (!open) {
              setPaying(null);
              setPayValue(null);
            }
          }}
          plan={payingPlan}
          payment={payingPayment}
          accounts={accountList}
          value={payValue}
          onChange={(patch) => setPayValue((v) => (v ? { ...v, ...patch } : v))}
          onSubmit={confirmPay}
          submitting={pay.isPending}
        />
      )}

      {form && (
        <InstallmentFormPanel
          open
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          mode={form.mode}
          value={formValue}
          onChange={(patch) => setFormValue((v) => ({ ...v, ...patch }))}
          accounts={accountList}
          categoryOptions={summary?.categories ?? []}
          cardFrozen={
            form.mode === "edit" && (plans.find((p) => p.id === form.planId)?.billedCount ?? 0) > 0
          }
          onSubmit={submitForm}
          submitting={create.isPending || update.isPending}
          dirty={form.mode === "edit"}
        />
      )}

      <DeletePlanConfirm
        plan={deletingPlan}
        accounts={accountList}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={confirmDelete}
        loading={remove.isPending}
      />
    </div>
  );
}

/** The API's language-agnostic code, translated; anything else is the generic one. */
function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof ApiRequestError ? t(`errors.${error.code}`) : t("errors.INTERNAL_ERROR");
}
