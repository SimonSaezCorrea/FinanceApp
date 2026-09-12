import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { savings } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { useAuth } from "../../auth/hooks/useAuth";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import {
  ASIDE_MIN_WIDTH,
  TABLE_ROW_MIN_WIDTH,
  useElementWidth,
} from "../../../shared/lib/useElementWidth";
import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { ClosedGoalsSection } from "../components/ClosedGoalsSection";
import { FreeSavingsDetailPanel } from "../components/FreeSavingsDetailPanel";
import { FreeSavingsSection } from "../components/FreeSavingsSection";
import { SavingsInsightsRail } from "../components/SavingsInsightsRail";
import {
  emptySavingsEntryForm,
  entryFormFrom,
  SavingsEntryFormPanel,
  type SavingsEntryFormValue,
} from "../components/SavingsEntryFormPanel";
import { SavingsEntryDeleteConfirm } from "../components/SavingsEntryDeleteConfirm";
import { SavingsEntryDetailPanel } from "../components/SavingsEntryDetailPanel";
import {
  defaultCloseValue,
  SavingsGoalClosePanel,
  type CloseDestination,
  type SavingsGoalCloseValue,
} from "../components/SavingsGoalClosePanel";
import { SavingsGoalDeleteConfirm } from "../components/SavingsGoalDeleteConfirm";
import { SavingsGoalDetailPanel } from "../components/SavingsGoalDetailPanel";
import {
  emptySavingsGoalForm,
  SavingsGoalFormPanel,
  savingsGoalFormFrom,
  type SavingsGoalFormValue,
} from "../components/SavingsGoalFormPanel";
import { SavingsGoalRow } from "../components/SavingsGoalRow";
import { SavingsGoalTable } from "../components/SavingsGoalTable";
import { SavingsGroupHeader } from "../components/SavingsGroupHeader";
import { SavingsSkeleton } from "../components/SavingsSkeleton";
import { SavingsTotalCard } from "../components/SavingsTotalCard";
import {
  useSavingsEntries,
  useSavingsGoals,
  useSavingsMutations,
  useSavingsSummary,
} from "../hooks/useSavings";
import { goalStatus, groupGoals, isGoalComplete } from "../lib/savingsMetrics";

const todayInput = () => new Date().toISOString().slice(0, 10);

function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof ApiRequestError ? t(`errors.${error.code}`) : t("errors.INTERNAL_ERROR");
}

export function SavingsRoute() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const preferredCurrency = user?.preferredCurrency ?? "CLP";

  const {
    data: goalsData,
    isLoading: goalsLoading,
    isError: goalsError,
    error: goalsErr,
    refetch,
  } = useSavingsGoals();
  const { data: entriesData } = useSavingsEntries();
  const { data: summaryData } = useSavingsSummary();
  const mutations = useSavingsMutations();
  const { data: accountsData } = useAccounts();

  const goals = useMemo(() => (goalsError ? [] : (goalsData ?? [])), [goalsData, goalsError]);
  const entries = useMemo(() => entriesData ?? [], [entriesData]);
  const accounts = accountsData ?? [];

  const openGoals = useMemo(() => goals.filter((g) => g.closedAt === null), [goals]);
  const closedGoals = useMemo(() => goals.filter((g) => g.closedAt !== null), [goals]);
  const groups = useMemo(() => groupGoals(goals), [goals]);
  const freeEntries = useMemo(() => entries.filter((e) => e.savingsGoalId === null), [entries]);

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState<{ mode: "create" | "edit"; id: string | null } | null>(
    null,
  );
  const [goalFormValue, setGoalFormValue] = useState<SavingsGoalFormValue>(() =>
    emptySavingsGoalForm(preferredCurrency),
  );
  // What each form looked like right after opening for edit — compared
  // against the live value so "sin guardar" only shows once something
  // actually changed, not for the mere fact of being in edit mode.
  const [goalFormBaseline, setGoalFormBaseline] = useState<SavingsGoalFormValue | null>(null);
  const [confirmLeaveGoalForm, setConfirmLeaveGoalForm] = useState(false);
  const [entryForm, setEntryForm] = useState<{ mode: "create" | "edit"; id: string | null } | null>(
    null,
  );
  const [entryFormValue, setEntryFormValue] = useState<SavingsEntryFormValue>(() =>
    emptySavingsEntryForm(todayInput()),
  );
  const [entryFormBaseline, setEntryFormBaseline] = useState<SavingsEntryFormValue | null>(null);
  const [confirmLeaveEntryForm, setConfirmLeaveEntryForm] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [freeSavingsOpen, setFreeSavingsOpen] = useState(false);
  // Only one goal row's swipe panel open at a time — opening another closes
  // the previous one for free, since both read off this single id.
  const [openSwipeGoalId, setOpenSwipeGoalId] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<savings.SavingsGoal | null>(null);
  const [closeValue, setCloseValue] = useState<SavingsGoalCloseValue | null>(null);
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<savings.SavingsGoal | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<savings.SavingsEntry | null>(null);

  // Retained through close so the form overlays play their exit animation
  // instead of unmounting the instant their target clears.
  const retainedGoalForm = useLastNonNull(goalForm);
  const retainedEntryForm = useLastNonNull(entryForm);
  const goalFormDirty =
    retainedGoalForm?.mode === "edit" &&
    JSON.stringify(goalFormValue) !== JSON.stringify(goalFormBaseline);
  const entryFormDirty =
    retainedEntryForm?.mode === "edit" &&
    JSON.stringify(entryFormValue) !== JSON.stringify(entryFormBaseline);

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null;
  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null;

  function openCreateGoal() {
    setGoalFormValue(emptySavingsGoalForm(preferredCurrency));
    setGoalFormBaseline(null);
    setGoalForm({ mode: "create", id: null });
  }

  function openEditGoal(g: savings.SavingsGoal) {
    const value = savingsGoalFormFrom(g);
    setGoalFormValue(value);
    setGoalFormBaseline(value);
    setGoalForm({ mode: "edit", id: g.id });
  }

  /** Dismissing the goal form: confirm first when there's something to lose. */
  function requestCloseGoalForm() {
    if (goalFormDirty) setConfirmLeaveGoalForm(true);
    else setGoalForm(null);
  }

  function submitGoalForm() {
    if (!goalForm) return;
    const title = goalFormValue.title.trim();
    const targetAmount = goalFormValue.targetAmount.trim();
    const currency = goalFormValue.currency.trim().toUpperCase();
    const notes = goalFormValue.notes.trim() || undefined;

    if (goalForm.mode === "edit" && goalForm.id) {
      mutations.updateGoal.mutate(
        {
          id: goalForm.id,
          body: {
            title,
            targetAmount,
            currency,
            deadline: goalFormValue.deadline
              ? new Date(`${goalFormValue.deadline}T00:00:00`).toISOString()
              : null,
            notes,
            color: goalFormValue.color,
          },
        },
        {
          onSuccess: () => {
            toast.success(t("savings.updated"));
            setGoalForm(null);
          },
          onError: (err: unknown) => toast.error(errorMessage(err, t)),
        },
      );
      return;
    }

    mutations.createGoal.mutate(
      {
        title,
        targetAmount,
        currency,
        deadline: goalFormValue.deadline
          ? new Date(`${goalFormValue.deadline}T00:00:00`).toISOString()
          : undefined,
        notes,
        color: goalFormValue.color ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("savings.created"));
          setGoalForm(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function openContribute(goalId: string | null) {
    setEntryFormValue(emptySavingsEntryForm(todayInput(), goalId ?? ""));
    setEntryFormBaseline(null);
    setEntryForm({ mode: "create", id: null });
  }

  function openEditEntry(e: savings.SavingsEntry) {
    const value = entryFormFrom(e);
    setEntryFormValue(value);
    setEntryFormBaseline(value);
    setEntryForm({ mode: "edit", id: e.id });
  }

  /** Dismissing the entry form: confirm first when there's something to lose. */
  function requestCloseEntryForm() {
    if (entryFormDirty) setConfirmLeaveEntryForm(true);
    else setEntryForm(null);
  }

  function submitEntryForm() {
    if (!entryForm) return;
    // The account is what actually decides the currency (the backend
    // validates against it) — never the user's preferred one, which would be
    // wrong the moment an aporte comes from an account in another currency.
    const entryCurrency =
      accounts.find((a) => a.id === entryFormValue.bankAccountId)?.currency ?? preferredCurrency;
    const body = {
      amount: entryFormValue.amount.trim(),
      currency: entryCurrency,
      contributedAt: new Date(`${entryFormValue.contributedAt}T00:00:00`).toISOString(),
      savingsGoalId: entryFormValue.savingsGoalId || undefined,
      bankAccountId: entryFormValue.bankAccountId,
      title: entryFormValue.title.trim() || undefined,
      note: entryFormValue.note.trim() || undefined,
    };

    if (entryForm.mode === "edit" && entryForm.id) {
      mutations.updateEntry.mutate(
        { id: entryForm.id, body, idempotencyKey: crypto.randomUUID() },
        {
          onSuccess: () => {
            toast.success(t("savings.updated"));
            setEntryForm(null);
          },
          onError: (err: unknown) => toast.error(errorMessage(err, t)),
        },
      );
      return;
    }

    mutations.createEntry.mutate(
      { body, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: () => {
          toast.success(t("savings.entry.registered"));
          setEntryForm(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function confirmDeleteGoal() {
    if (!deleteGoalTarget) return;
    mutations.removeGoal.mutate(deleteGoalTarget.id, {
      onSuccess: () => {
        toast.success(t("savings.deletedGoal"));
        if (selectedGoalId === deleteGoalTarget.id) setSelectedGoalId(null);
        setDeleteGoalTarget(null);
      },
      onError: (err: unknown) => toast.error(errorMessage(err, t)),
    });
  }

  function confirmDeleteEntry() {
    if (!deleteEntryTarget) return;
    mutations.removeEntry.mutate(
      { id: deleteEntryTarget.id, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: () => {
          toast.success(t("savings.entry.deleted"));
          if (selectedEntryId === deleteEntryTarget.id) setSelectedEntryId(null);
          setDeleteEntryTarget(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function openClose(g: savings.SavingsGoal) {
    const complete = isGoalComplete(goalStatus(g, new Date()));
    setCloseTarget(g);
    setCloseValue(defaultCloseValue(complete, todayInput()));
  }

  function submitClose() {
    if (!closeTarget || !closeValue) return;
    const destination = closeValue.destination as CloseDestination;
    const closedAt = new Date(`${closeValue.closedAt}T00:00:00`).toISOString();
    let body: savings.CloseSavingsGoal;
    if (destination === "WITHDRAW_TO_ACCOUNT") {
      body = { destination, accountId: closeValue.accountId, closedAt };
    } else if (destination === "TRANSFER_TO_GOAL") {
      body = { destination, targetGoalId: closeValue.targetGoalId, closedAt };
    } else {
      body = { destination, closedAt };
    }

    mutations.closeGoal.mutate(
      { id: closeTarget.id, idempotencyKey: crypto.randomUUID(), body },
      {
        onSuccess: () => {
          toast.success(t("savings.closedToast", { title: closeTarget.title }));
          setCloseTarget(null);
          setCloseValue(null);
          if (selectedGoalId === closeTarget.id) setSelectedGoalId(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function reopenGoal(g: savings.SavingsGoal) {
    mutations.reopenGoal.mutate(
      { id: g.id, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: () => toast.success(t("savings.reopened", { title: g.title })),
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  const missing = summaryData?.missing ?? "0";

  // Second column only where the account detail's own aside already earns
  // one (`ASIDE_MIN_WIDTH`, measured on this view — a sidebar-driven width
  // change a media query can't see).
  const [shellRef, shellWidth] = useElementWidth();
  const isDesktop = shellWidth !== null && shellWidth >= ASIDE_MIN_WIDTH;

  // Table vs. compact row, measured on the goals column itself (not the
  // whole shell): once the insights rail claims its own 300px, this column
  // is narrower than the shell — same `TABLE_ROW_MIN_WIDTH` Deudas/Cuotas/
  // Movimientos already share.
  const [goalsColRef, goalsColWidth] = useElementWidth();
  const showTable = goalsColWidth !== null && goalsColWidth >= TABLE_ROW_MIN_WIDTH;

  return (
    <div ref={shellRef} className="flex flex-col gap-6">
      <PageHeader
        title={t("savings.title")}
        description={
          !goalsLoading && !goalsError
            ? t("savings.subtitle", { count: openGoals.length, missing })
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => openContribute(null)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("savings.freeContribution")}
            </Button>
            <Button variant="accent" onClick={openCreateGoal}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("savings.new")}
            </Button>
          </div>
        }
      />

      {goalsLoading && <SavingsSkeleton label={t("app.loading")} />}
      {!goalsLoading && goalsError && <ErrorState error={goalsErr} onRetry={() => refetch()} />}
      {!goalsLoading && !goalsError && goals.length === 0 && freeEntries.length === 0 && (
        <EmptyState title={t("savings.empty")} />
      )}

      {!goalsLoading && !goalsError && (goals.length > 0 || freeEntries.length > 0) ? (
        <div className={cn("flex flex-col gap-6", isDesktop && "flex-row items-start")}>
          <div ref={goalsColRef} className="flex min-w-0 flex-1 flex-col gap-6">
            {summaryData ? (
              <SavingsTotalCard
                summary={summaryData}
                openGoals={openGoals}
                closedGoals={closedGoals}
                entries={entries}
                currency={preferredCurrency}
              />
            ) : null}

            {(["live", "late", "done"] as const).map((key) =>
              groups[key].length > 0 ? (
                <div key={key} className="flex flex-col gap-2">
                  <SavingsGroupHeader
                    title={t(`savings.groups.${key}`)}
                    amounts={groups[key].map((g) => g.goal.savedAmount)}
                    currency={preferredCurrency}
                  />
                  {showTable ? (
                    <SavingsGoalTable
                      goals={groups[key].map((g) => g.goal)}
                      currency={preferredCurrency}
                      onSelect={(goal) => setSelectedGoalId(goal.id)}
                      onContribute={(goal) => openContribute(goal.id)}
                      onEdit={openEditGoal}
                      onClose={openClose}
                    />
                  ) : (
                    <div className="overflow-hidden rounded-[9.6px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
                      {groups[key].map(({ goal }) => (
                        <SavingsGoalRow
                          key={goal.id}
                          goal={goal}
                          currency={preferredCurrency}
                          swipeOpen={openSwipeGoalId === goal.id}
                          onSwipeOpenChange={(open) => setOpenSwipeGoalId(open ? goal.id : null)}
                          onSelect={() => setSelectedGoalId(goal.id)}
                          onContribute={() => openContribute(goal.id)}
                          onEdit={() => openEditGoal(goal)}
                          onClose={() => openClose(goal)}
                          onDelete={() => setDeleteGoalTarget(goal)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null,
            )}

            <ClosedGoalsSection
              goals={closedGoals}
              allGoals={goals}
              accounts={accounts}
              currency={preferredCurrency}
              onReopen={reopenGoal}
            />

            <FreeSavingsSection
              entries={freeEntries}
              currency={preferredCurrency}
              onSelect={() => setFreeSavingsOpen(true)}
              onSelectEntry={(e) => setSelectedEntryId(e.id)}
            />
          </div>

          {isDesktop ? (
            <SavingsInsightsRail goals={openGoals} currency={preferredCurrency} />
          ) : null}
        </div>
      ) : null}

      <FreeSavingsDetailPanel
        open={freeSavingsOpen}
        entries={freeEntries}
        currency={preferredCurrency}
        onOpenChange={setFreeSavingsOpen}
        onContribute={() => openContribute(null)}
        onSelectEntry={(e) => setSelectedEntryId(e.id)}
      />

      <SavingsGoalDetailPanel
        goal={selectedGoal}
        entries={entries}
        currency={preferredCurrency}
        onOpenChange={(open) => {
          if (!open) setSelectedGoalId(null);
        }}
        onEdit={() => selectedGoal && openEditGoal(selectedGoal)}
        onContribute={() => selectedGoal && openContribute(selectedGoal.id)}
        onClose={() => selectedGoal && openClose(selectedGoal)}
        onDelete={() => selectedGoal && setDeleteGoalTarget(selectedGoal)}
        onSelectEntry={(e) => setSelectedEntryId(e.id)}
      />

      <SavingsEntryDetailPanel
        entry={selectedEntry}
        goals={goals}
        accounts={accounts}
        onOpenChange={(open) => {
          if (!open) setSelectedEntryId(null);
        }}
        onEdit={() => selectedEntry && openEditEntry(selectedEntry)}
        onDelete={() => selectedEntry && setDeleteEntryTarget(selectedEntry)}
      />

      <SavingsGoalFormPanel
        open={goalForm !== null}
        onOpenChange={(open) => {
          if (!open) requestCloseGoalForm();
        }}
        mode={retainedGoalForm?.mode ?? "create"}
        value={goalFormValue}
        onChange={(patch) => setGoalFormValue((v) => ({ ...v, ...patch }))}
        currencyLocked={
          retainedGoalForm?.mode === "edit" &&
          entries.some((e) => e.savingsGoalId === retainedGoalForm.id)
        }
        onSubmit={submitGoalForm}
        submitting={mutations.createGoal.isPending || mutations.updateGoal.isPending}
        dirty={goalFormDirty}
      />

      <ConfirmModal
        open={confirmLeaveGoalForm}
        onOpenChange={(v) => !v && setConfirmLeaveGoalForm(false)}
        title={t("savings.form.leaveConfirm")}
        description={t("savings.form.leaveConfirmDescription")}
        confirmLabel={t("savings.form.leaveDiscard")}
        onConfirm={() => {
          setConfirmLeaveGoalForm(false);
          setGoalForm(null);
        }}
      />

      <SavingsEntryFormPanel
        open={entryForm !== null}
        onOpenChange={(open) => {
          if (!open) requestCloseEntryForm();
        }}
        mode={retainedEntryForm?.mode ?? "create"}
        value={entryFormValue}
        onChange={(patch) => setEntryFormValue((v) => ({ ...v, ...patch }))}
        openGoals={openGoals}
        accounts={accounts}
        onSubmit={submitEntryForm}
        submitting={mutations.createEntry.isPending || mutations.updateEntry.isPending}
        dirty={entryFormDirty}
      />

      <ConfirmModal
        open={confirmLeaveEntryForm}
        onOpenChange={(v) => !v && setConfirmLeaveEntryForm(false)}
        title={t("savings.entry.leaveConfirm")}
        description={t("savings.entry.leaveConfirmDescription")}
        confirmLabel={t("savings.entry.leaveDiscard")}
        onConfirm={() => {
          setConfirmLeaveEntryForm(false);
          setEntryForm(null);
        }}
      />

      <SavingsGoalClosePanel
        open={closeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCloseTarget(null);
            setCloseValue(null);
          }
        }}
        goal={closeTarget}
        complete={closeTarget ? isGoalComplete(goalStatus(closeTarget, new Date())) : false}
        value={closeValue}
        onChange={(patch) => setCloseValue((v) => (v ? { ...v, ...patch } : v))}
        accounts={accounts}
        otherOpenGoals={closeTarget ? openGoals.filter((g) => g.id !== closeTarget.id) : []}
        onSubmit={submitClose}
        submitting={mutations.closeGoal.isPending}
      />

      <SavingsGoalDeleteConfirm
        goal={deleteGoalTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteGoalTarget(null);
        }}
        onConfirm={confirmDeleteGoal}
        loading={mutations.removeGoal.isPending}
      />

      <SavingsEntryDeleteConfirm
        entry={deleteEntryTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteEntryTarget(null);
        }}
        onConfirm={confirmDeleteEntry}
        loading={mutations.removeEntry.isPending}
      />
    </div>
  );
}
