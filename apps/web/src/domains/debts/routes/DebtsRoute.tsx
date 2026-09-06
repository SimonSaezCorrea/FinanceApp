import { Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { debts } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { useAuth } from "../../auth/hooks/useAuth";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { TABLE_ROW_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { ErrorState, LoadingState } from "../../../shared/ui/states";
import { DebtDetailPanel } from "../components/DebtDetailPanel";
import {
  DebtFormPanel,
  debtFormFrom,
  emptyDebtForm,
  type DebtFormValue,
} from "../components/DebtFormPanel";
import { DebtKpiStrip } from "../components/DebtKpiStrip";
import { DebtList } from "../components/DebtList";
import { DebtPayPanel } from "../components/DebtPayPanel";
import { DebtTable } from "../components/DebtTable";
import { useDebtMutations } from "../hooks/useDebtMutations";
import { useDebts } from "../hooks/useDebts";
import { isOverdue, uniquePeopleCount } from "../lib/debtMetrics";

type DebtDirFilter = "ALL" | "OWED_TO_YOU" | "YOU_OWE" | "OVERDUE";
type StatusFilter = "active" | "settled" | "all";

const todayInput = () => new Date().toISOString().slice(0, 10);

export function DebtsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useDebts();
  const { data: accounts } = useAccounts();
  const { user } = useAuth();
  const preferredCurrency = user?.preferredCurrency ?? "CLP";
  const { create, update, settle, unsettle, registerPayment, undoPayment, remove } =
    useDebtMutations();

  const [debtDir, setDebtDir] = useState<DebtDirFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" | "edit"; debtId: string | null } | null>(null);
  const [formValue, setFormValue] = useState<DebtFormValue>(() =>
    emptyDebtForm(todayInput(), preferredCurrency),
  );
  const [payingId, setPayingId] = useState<string | null>(null);
  // Which account settle/register-payment moves the real money on/from — sent
  // as the mutation's own `accountId` body field (see `useDebtMutations`).
  const [payAccountId, setPayAccountId] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [containerRef, containerWidth] = useElementWidth();
  // Consistent with Movimientos/Cuotas/Facturación's own unified table↔list
  // breakpoint (`TABLE_ROW_MIN_WIDTH`, measured on the table's own container —
  // see `shared/lib/useElementWidth.ts`), rather than the handoff's literal
  // "≥1280px de viewport" note: this repo standardized every such table on ONE
  // shared, container-measured threshold on 2026-08-24 specifically so these
  // breakpoints can't drift into three different shapes again. Below that
  // width, `DebtList` renders instead — same decision procedure, different
  // number domain.
  const showTable = containerWidth !== null && containerWidth >= TABLE_ROW_MIN_WIDTH;

  // react-query keeps the last successful `data` across a failed refetch — treat
  // it as empty whenever the CURRENT state is an error, same guard the other
  // redesigned views use.
  const list = useMemo(() => (isError ? [] : (data ?? [])), [data, isError]);
  const activeDebts = useMemo(() => list.filter((d) => d.settledAt === null), [list]);
  const accountList = useMemo(() => accounts ?? [], [accounts]);

  const filtered = useMemo(() => {
    const now = new Date();
    return list
      .filter((d) => {
        if (debtDir === "OVERDUE") return isOverdue(d, now);
        if (debtDir === "ALL") return true;
        return d.direction === debtDir;
      })
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
  }, [list, debtDir, statusFilter]);

  const selectedDebt = list.find((d) => d.id === selectedId) ?? null;
  const payingDebt = list.find((d) => d.id === payingId) ?? null;
  const deletingDebt = list.find((d) => d.id === deleteId) ?? null;

  const debtDirOptions: { value: DebtDirFilter; label: string }[] = [
    { value: "ALL", label: t("debts.filters.all") },
    { value: "OWED_TO_YOU", label: t("debts.direction.OWED_TO_YOU") },
    { value: "YOU_OWE", label: t("debts.direction.YOU_OWE") },
    { value: "OVERDUE", label: t("debts.filters.overdue") },
  ];

  function selectDebt(id: string | null) {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setSelectedId(id);
  }

  function closeDetail() {
    setSelectedId(null);
    returnFocusRef.current?.focus?.();
  }

  function openCreate() {
    const defaultAccountId =
      accountList.find((a) => a.currency === preferredCurrency)?.id ?? accountList[0]?.id ?? "";
    setFormValue(emptyDebtForm(todayInput(), preferredCurrency, defaultAccountId));
    setForm({ mode: "create", debtId: null });
  }

  function openEdit(debt: debts.Debt) {
    setFormValue(debtFormFrom(debt, todayInput()));
    setForm({ mode: "edit", debtId: debt.id });
  }

  function openPay(debt: debts.Debt) {
    // Only an account that could actually settle this debt (same currency,
    // never CREDIT_CARD — see `DebtPayPanel`'s own filter) counts as a valid
    // default, `paymentAccountId` included: a stale/mismatched suggestion is
    // no better than none.
    const eligible = accountList.filter(
      (a) => a.currency === debt.currency && a.type !== "CREDIT_CARD",
    );
    setPayAccountId(
      (debt.paymentAccountId && eligible.some((a) => a.id === debt.paymentAccountId)
        ? debt.paymentAccountId
        : null) ??
        eligible[0]?.id ??
        "",
    );
    setPayingId(debt.id);
  }

  function confirmPay() {
    if (!payingDebt || !payAccountId) return;
    const hasInstallments = payingDebt.totalInstallments > 1;
    const allPaidAfterThis = payingDebt.paidInstallments + 1 >= payingDebt.totalInstallments;

    if (!hasInstallments || allPaidAfterThis) {
      settle.mutate(
        {
          id: payingDebt.id,
          idempotencyKey: crypto.randomUUID(),
          body: { accountId: payAccountId },
        },
        {
          onSuccess: () => {
            toast.success(t("debts.pay.settledToast"));
            setPayingId(null);
          },
          onError: (err: unknown) => toast.error(errorMessage(err, t)),
        },
      );
      return;
    }

    registerPayment.mutate(
      { id: payingDebt.id, idempotencyKey: crypto.randomUUID(), body: { accountId: payAccountId } },
      {
        onSuccess: () => {
          toast.success(t("debts.pay.registeredToast"));
          setPayingId(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function handleUnsettle(id: string) {
    unsettle.mutate(
      { id, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: () => toast.success(t("debts.updated")),
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function handleUndoPayment(id: string) {
    undoPayment.mutate(
      { id, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: () => toast.success(t("debts.card.undoPayment")),
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function submitForm() {
    if (!form) return;
    const body = {
      direction: formValue.direction,
      counterparty: formValue.counterparty.trim(),
      principal: formValue.amount.trim(),
      currency: formValue.currency.trim().toUpperCase(),
      dueAt: formValue.dueAt ? new Date(formValue.dueAt).toISOString() : undefined,
      totalInstallments: formValue.totalInstallments,
      frequency: formValue.frequency,
      frequencyInterval: formValue.frequencyInterval,
      title: formValue.title.trim() || undefined,
      notes: formValue.notes.trim() || undefined,
      paymentAccountId: formValue.paymentAccountId || null,
    };

    if (form.mode === "edit" && form.debtId) {
      update.mutate(
        { id: form.debtId, body },
        {
          onSuccess: () => {
            toast.success(t("debts.updated"));
            setForm(null);
          },
          onError: (err: unknown) => toast.error(errorMessage(err, t)),
        },
      );
      return;
    }

    create.mutate(
      { ...body, openedAt: new Date().toISOString() },
      {
        onSuccess: () => {
          toast.success(t("debts.created"));
          setForm(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function confirmDelete() {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => {
        toast.success(t("debts.deleted"));
        setDeleteId(null);
        if (selectedId === deleteId) setSelectedId(null);
      },
      onError: (err: unknown) => toast.error(errorMessage(err, t)),
    });
  }

  const subtitle =
    !isLoading && !isError
      ? t("debts.subtitle", {
          count: activeDebts.length,
          people: uniquePeopleCount(activeDebts),
        })
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("debts.title")}
        description={subtitle}
        actions={
          <Button variant="accent" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("debts.new")}
          </Button>
        }
      />

      {isLoading && <LoadingState title={t("app.loading")} />}
      {!isLoading && isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {!isLoading && !isError && (
        <>
          <DebtKpiStrip debts={activeDebts} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={debtDir} onChange={setDebtDir} options={debtDirOptions} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-[7.6px] border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="active">{t("debts.filters.active")}</option>
                <option value="settled">{t("debts.filters.settled")}</option>
                <option value="all">{t("debts.filters.allStatus")}</option>
              </select>
            </div>
            <span className="text-sm text-muted-foreground">{t("debts.filters.sortByDue")}</span>
          </div>

          <div ref={containerRef}>
            {showTable ? (
              <DebtTable
                debts={filtered}
                onSelect={selectDebt}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onPay={openPay}
                emptyTitle={t("debts.empty")}
                emptyMessage={t("debts.emptyHint")}
                error={error}
                onRetry={() => refetch()}
              />
            ) : (
              <DebtList
                debts={filtered}
                onSelect={selectDebt}
                emptyTitle={t("debts.empty")}
                emptyMessage={t("debts.emptyHint")}
                error={error}
                onRetry={() => refetch()}
              />
            )}
          </div>
        </>
      )}

      <DebtDetailPanel
        debt={selectedDebt}
        accounts={accountList}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        onPay={() => selectedDebt && openPay(selectedDebt)}
        onEdit={() => selectedDebt && openEdit(selectedDebt)}
        onUnsettle={() => selectedDebt && handleUnsettle(selectedDebt.id)}
        onUndoPayment={() => selectedDebt && handleUndoPayment(selectedDebt.id)}
        unsettlePending={unsettle.isPending}
        undoPaymentPending={undoPayment.isPending}
      />

      {payingDebt ? (
        <DebtPayPanel
          debt={payingDebt}
          accounts={accountList}
          payAccountId={payAccountId}
          onPayAccountChange={setPayAccountId}
          onOpenChange={(open) => {
            if (!open) setPayingId(null);
          }}
          onConfirm={confirmPay}
          submitting={settle.isPending || registerPayment.isPending}
        />
      ) : null}

      {form ? (
        <DebtFormPanel
          open
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          mode={form.mode}
          value={formValue}
          onChange={(patch) => setFormValue((v) => ({ ...v, ...patch }))}
          accounts={accountList}
          onSubmit={submitForm}
          submitting={create.isPending || update.isPending}
          dirty={form.mode === "edit"}
        />
      ) : null}

      <ConfirmModal
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={confirmDelete}
        title={t("common.confirmDeleteTitle")}
        description={
          deletingDebt
            ? t("debts.delete.description", { name: deletingDebt.counterparty })
            : t("common.confirmDelete")
        }
        loading={remove.isPending}
      />
    </div>
  );
}

/** The API's language-agnostic code, translated; anything else is the generic one. */
function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof ApiRequestError ? t(`errors.${error.code}`) : t("errors.INTERNAL_ERROR");
}
