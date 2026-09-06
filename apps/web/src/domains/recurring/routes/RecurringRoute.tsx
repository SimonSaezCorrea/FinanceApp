import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { recurring } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { useAuth } from "../../auth/hooks/useAuth";
import { useTransactionsSummary } from "../../transactions/hooks/useTransactions";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { RecurringAutoGenerationStrip } from "../components/RecurringAutoGenerationStrip";
import { RecurringDetailPanel } from "../components/RecurringDetailPanel";
import {
  emptyRecurringForm,
  recurringFormFrom,
  RecurringFormPanel,
  type RecurringFormValue,
} from "../components/RecurringFormPanel";
import { RecurringGroup } from "../components/RecurringGroup";
import { RecurringPauseModal } from "../components/RecurringPauseModal";
import { RecurringTotalCard } from "../components/RecurringTotalCard";
import { useRecurring, useRecurringMutations } from "../hooks/useRecurring";
import { FREQUENCY_ORDER, recurringByCurrency } from "../lib/recurringMetrics";

const todayInput = () => new Date().toISOString().slice(0, 10);

/**
 * Recurrentes: total comprometido al mes (per currency), an automatic
 * generation strip, and one group per periodicity (Semanales → Mensuales →
 * Anuales), with Pausados last. See `RecurringPauseModal` and
 * `RecurringDetailPanel` for the two known data-model gaps this redesign
 * works around: no persisted pause-effective-date (only `active`) and no
 * link from a series to the movements it would have generated.
 */
export function RecurringRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useRecurring();
  const { data: accounts } = useAccounts();
  const { user } = useAuth();
  const preferredCurrency = user?.preferredCurrency ?? "CLP";
  const { create, update, remove } = useRecurringMutations();
  // The same category vocabulary Movimientos offers — one shared list, not a
  // second one this domain invents.
  const { data: summary } = useTransactionsSummary();
  const categoryOptions = summary?.categories ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" | "edit"; id: string | null } | null>(null);
  const [formValue, setFormValue] = useState<RecurringFormValue>(() =>
    emptyRecurringForm(todayInput(), preferredCurrency),
  );
  const [pauseTarget, setPauseTarget] = useState<recurring.RecurringExpense | null>(null);
  const [pauseDate, setPauseDate] = useState(todayInput());
  const [deleteTarget, setDeleteTarget] = useState<recurring.RecurringExpense | null>(null);

  const list = useMemo(() => (isError ? [] : (data ?? [])), [data, isError]);
  const accountList = useMemo(() => accounts ?? [], [accounts]);

  const selected = list.find((r) => r.id === selectedId) ?? null;
  const activeCount = list.filter((r) => r.active).length;
  const pausedList = useMemo(
    () => list.filter((r) => !r.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [list],
  );

  const groups = useMemo(
    () =>
      FREQUENCY_ORDER.map((freq) => ({
        freq,
        items: list
          .filter((r) => r.active && r.frequency === freq)
          .sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt)),
      })).filter((g) => g.items.length > 0),
    [list],
  );

  const currencyGroups = useMemo(() => recurringByCurrency(list), [list]);

  const subtitle = !isLoading && !isError
    ? t("recurring.subtitle", { active: activeCount, paused: pausedList.length })
    : undefined;

  function openCreate() {
    // No account preselected — a recurring series isn't necessarily tied to
    // one (it's optional on the model), and it needs to start on "Sin cuenta
    // asociada" rather than picking one on the user's behalf.
    setFormValue(emptyRecurringForm(todayInput(), preferredCurrency));
    setForm({ mode: "create", id: null });
  }

  function openEdit(r: recurring.RecurringExpense) {
    setFormValue(recurringFormFrom(r));
    setForm({ mode: "edit", id: r.id });
  }

  function openPause(r: recurring.RecurringExpense) {
    setPauseDate(todayInput());
    setPauseTarget(r);
  }

  function confirmPause() {
    if (!pauseTarget) return;
    const resume = !pauseTarget.active;
    update.mutate(
      { id: pauseTarget.id, body: { active: resume } },
      {
        onSuccess: () => {
          toast.success(
            t(resume ? "recurring.pause.resumedToast" : "recurring.pause.pausedToast", {
              name: pauseTarget.label,
            }),
          );
          setPauseTarget(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function submitForm() {
    if (!form) return;
    const body = {
      label: formValue.label.trim(),
      amount: formValue.amount.trim(),
      currency: formValue.currency.trim().toUpperCase(),
      category: formValue.category.trim() || undefined,
      frequency: formValue.frequency,
      interval: formValue.interval,
      anchorDate: new Date(`${formValue.anchorDate}T00:00:00`).toISOString(),
      bankAccountId: formValue.bankAccountId || undefined,
      cardId: formValue.cardId || undefined,
      active: formValue.active,
      notes: formValue.notes.trim() || undefined,
    };

    if (form.mode === "edit" && form.id) {
      update.mutate(
        { id: form.id, body },
        {
          onSuccess: () => {
            toast.success(t("recurring.updated"));
            setForm(null);
          },
          onError: (err: unknown) => toast.error(errorMessage(err, t)),
        },
      );
      return;
    }

    create.mutate(body, {
      onSuccess: () => {
        toast.success(t("recurring.created"));
        setForm(null);
      },
      onError: (err: unknown) => toast.error(errorMessage(err, t)),
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t("recurring.deleted"));
        if (selectedId === deleteTarget.id) setSelectedId(null);
        setDeleteTarget(null);
      },
      onError: (err: unknown) => toast.error(errorMessage(err, t)),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("recurring.title")}
        description={subtitle}
        actions={
          <Button variant="accent" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("recurring.new")}
          </Button>
        }
      />

      {isLoading && <LoadingState title={t("app.loading")} />}
      {!isLoading && isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {!isLoading && !isError && list.length === 0 && <EmptyState title={t("recurring.empty")} />}

      {!isLoading && !isError && list.length > 0 && (
        <>
          <RecurringTotalCard groups={currencyGroups} />
          <RecurringAutoGenerationStrip />

          {groups.map((g) => (
            <RecurringGroup
              key={g.freq}
              title={t(`recurring.groups.${g.freq}`)}
              items={g.items}
              accounts={accountList}
              onSelect={(r) => setSelectedId(r.id)}
              onTogglePause={openPause}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}

          {pausedList.length > 0 ? (
            <RecurringGroup
              title={t("recurring.groups.PAUSED")}
              items={pausedList}
              accounts={accountList}
              paused
              onSelect={(r) => setSelectedId(r.id)}
              onTogglePause={openPause}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ) : null}
        </>
      )}

      <RecurringDetailPanel
        r={selected}
        accounts={accountList}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onTogglePause={() => selected && openPause(selected)}
        onEdit={() => selected && openEdit(selected)}
        onDelete={() => selected && setDeleteTarget(selected)}
      />

      {form ? (
        <RecurringFormPanel
          open
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          mode={form.mode}
          value={formValue}
          onChange={(patch) => setFormValue((v) => ({ ...v, ...patch }))}
          accounts={accountList}
          categoryOptions={categoryOptions}
          onSubmit={submitForm}
          submitting={create.isPending || update.isPending}
          dirty={form.mode === "edit"}
        />
      ) : null}

      {pauseTarget ? (
        <RecurringPauseModal
          open
          onOpenChange={(open) => {
            if (!open) setPauseTarget(null);
          }}
          name={pauseTarget.label}
          resume={!pauseTarget.active}
          date={pauseDate}
          onDateChange={setPauseDate}
          onConfirm={confirmPause}
          submitting={update.isPending}
        />
      ) : null}

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        title={t("common.confirmDeleteTitle")}
        description={
          deleteTarget
            ? t("recurring.delete.description", { name: deleteTarget.label })
            : t("common.confirmDelete")
        }
        loading={remove.isPending}
      />
    </div>
  );
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof ApiRequestError ? t(`errors.${error.code}`) : t("errors.INTERNAL_ERROR");
}
